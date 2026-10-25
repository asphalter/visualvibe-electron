#!/usr/bin/env python3
"""
014_zoo-timestamp.py — boot — patch Zoo Code extension to show timestamps
beside agent responses with an on-the-fly toggle command and enabled by default.

Features:
- Extends package.json with configuration property "zoo-code.showTimestamps" (default: true)
  and command "zoo-code.toggleTimestamps" ("Zoo Code: Toggle Message Timestamps").
- Patches dist/extension.js:
  * Registers "zoo-code.toggleTimestamps" command toggling the configuration.
  * Adds workspace.onDidChangeConfiguration listener forwarding { type: "vvToggleTimestamps", enabled } to webview.
  * Injects CSS (.vv-timestamp, body.vv-show-timestamps .vv-timestamp, [data-vv-ts] relative
    positioning and a fallback badge) and helper script with nonce in getHtmlContent().
  * The helper script now walks every [data-vv-ts] row and attaches the timestamp to the
    first header (div[style*="align-items:center"][style*="gap:10px"]) of ANY agent block
    (text, tool, api_req_started, command_output, completion_result, followup,
    user_feedback, ...), with an absolute-positioned fallback on rows without a header.
- Patches webview-ui/build/assets/index.js:
  * Adds data-vv-ts={message.ts} to the ChatRow wrapper so each rendered row carries
    its real timestamp; the helper script reads this attribute directly.
- Idempotent with versioned markers and rollback on failure via .orig backups.
"""
import sys
import os
import re
import json
import shutil
import subprocess

sys.path.insert(0, "/opt/visualvibe/scripts/lib")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from vv_common import VV_USER, latest_zoo_ext_dir, PatchTracker

ZOO_CODE_COMPAT_VERSION = "3.92.0"
MARKER_EXT_V1 = "/*[VisualVibe timestamp display v1]*/"
MARKER_EXT = "/*[VisualVibe timestamp display v2]*/"
MARKER_PKG = "zoo-code.showTimestamps"
MARKER_WEBVIEW = "data-vv-ts"

tracker = PatchTracker("014_zoo-timestamp", compat_version=ZOO_CODE_COMPAT_VERSION)


def check_js_syntax(file_path: str) -> bool:
    """Verifica la validità sintattica del file JavaScript usando il runtime Node/VSCodium se disponibile."""
    codium_bin = "/usr/share/codium/codium"
    if os.path.isfile(codium_bin):
        env = os.environ.copy()
        env["ELECTRON_RUN_AS_NODE"] = "1"
        try:
            res = subprocess.run([codium_bin, "--check", file_path], env=env, capture_output=True, text=True)
            if res.returncode != 0:
                print(f"[Init] JS syntax error in {file_path}:\n{res.stderr}")
                return False
            return True
        except Exception as e:
            print(f"[Init] WARN: Could not execute codium check: {e}")
            return True
    return True


def patch_package_json(ext_dir: str) -> bool:
    pkg_json = os.path.join(ext_dir, "package.json")
    if not os.path.isfile(pkg_json):
        print("[Init] package.json not found in", ext_dir)
        return False

    orig_backup = pkg_json + ".orig"
    if not os.path.isfile(orig_backup):
        shutil.copy2(pkg_json, orig_backup)

    with open(pkg_json, "r", encoding="utf-8") as f:
        try:
            pkg = json.load(f)
        except Exception as e:
            print(f"[Init] Failed to parse package.json: {e}")
            return False

    # Check if already patched
    contributes = pkg.setdefault("contributes", {})
    configuration = contributes.setdefault("configuration", {})
    properties = configuration.setdefault("properties", {})

    modified = False

    desired_desc = "Show date and time next to each agent response in chat"
    if "zoo-code.showTimestamps" not in properties:
        properties["zoo-code.showTimestamps"] = {
            "type": "boolean",
            "default": True,
            "description": desired_desc
        }
        modified = True
    elif properties["zoo-code.showTimestamps"].get("description") != desired_desc:
        properties["zoo-code.showTimestamps"]["description"] = desired_desc
        modified = True

    commands = contributes.setdefault("commands", [])
    has_toggle_cmd = any(c.get("command") == "zoo-code.toggleTimestamps" for c in commands)
    if not has_toggle_cmd:
        commands.append({
            "command": "zoo-code.toggleTimestamps",
            "title": "Zoo Code: Toggle Message Timestamps"
        })
        modified = True

    if modified:
        with open(pkg_json, "w", encoding="utf-8") as f:
            json.dump(pkg, f, indent=2)
            f.write("\n")
        print("[Init] [VV-PATCH-OK] package.json updated with zoo-code.showTimestamps and toggle command.")
    else:
        print("[Init] package.json already has timestamp configuration and command.")

    try:
        shutil.chown(pkg_json, user=VV_USER, group=VV_USER)
    except Exception:
        pass

    return True


def patch_extension_js(ext_dir: str) -> bool:
    ext_js = os.path.join(ext_dir, "dist", "extension.js")
    if not os.path.isfile(ext_js):
        print("[Init] dist/extension.js not found in", ext_dir)
        return False

    with open(ext_js, "r", encoding="utf-8", errors="replace") as f:
        s = f.read()

    # Migrazione v1 -> v2: se è presente la vecchia patch (solo say:text), ripristina
    # dai backup originali per applicare da zero la nuova logica universale senza
    # duplicare le iniezioni di comandi/listener/body.
    if MARKER_EXT_V1 in s and MARKER_EXT not in s:
        orig_backup = ext_js + ".orig"
        if os.path.isfile(orig_backup):
            with open(orig_backup, "r", encoding="utf-8", errors="replace") as f:
                s = f.read()
            with open(ext_js, "w", encoding="utf-8") as f:
                f.write(s)
            print("[Init] Migrated Zoo Code timestamp patch v1 -> v2 (restored extension.js from .orig).")
        else:
            print("[Init] ERROR: v1 patch present but .orig backup missing; aborting to avoid duplicate injections.")
            return False

    if MARKER_EXT in s:
        print(f"[Init] Zoo Code timestamp display patch ({MARKER_EXT}) already applied.")
        return True

    orig_backup = ext_js + ".orig"
    if not os.path.isfile(orig_backup):
        shutil.copy2(ext_js, orig_backup)

    # 1. Patch commands and configuration listener in activate()
    # Matches provider setup calls across versions (e.g. Rar in 3.90.0, bbr in 3.92.0):
    # Anchor pattern: <fn>({context:<ctx>,outputChannel:<chan>,provider:<prov>});
    prov_match = re.search(
        r"([a-zA-Z0-9_$]+)\(\{\s*context:\s*([a-zA-Z0-9_$]+)\s*,\s*outputChannel:\s*[a-zA-Z0-9_$]+\s*,\s*provider:\s*([a-zA-Z0-9_$]+)\s*\}\);",
        s
    )
    if prov_match:
        prov_anchor = prov_match.group(0)
        ctx_var = prov_match.group(2)
        prov_var = prov_match.group(3)
        cmd_injection = (
            '/*[VisualVibe timestamp display v1 - commands]*/'
            'try{'
            'const _vsc=(typeof vscode!=="undefined"?vscode:require("vscode"));'
            f'{ctx_var}.subscriptions.push(_vsc.commands.registerCommand("zoo-code.toggleTimestamps",async()=>{{'
            'const cfg=_vsc.workspace.getConfiguration("zoo-code");'
            'const cur=cfg.get("showTimestamps",true);'
            'await cfg.update("showTimestamps",!cur,_vsc.ConfigurationTarget.Global);'
            '}));'
            f'{ctx_var}.subscriptions.push(_vsc.workspace.onDidChangeConfiguration(e=>{{'
            'if(e.affectsConfiguration("zoo-code.showTimestamps")){'
            'const enabled=_vsc.workspace.getConfiguration("zoo-code").get("showTimestamps",true);'
            f'const p=({prov_var}&&{prov_var}.constructor&&{prov_var}.constructor.getVisibleInstance&&{prov_var}.constructor.getVisibleInstance())||{prov_var};'
            'if(p&&p.postMessageToWebview){p.postMessageToWebview({type:"vvToggleTimestamps",enabled:enabled});}'
            f'if({prov_var}&&{prov_var}!==p&&{prov_var}.postMessageToWebview){{{prov_var}.postMessageToWebview({{type:"vvToggleTimestamps",enabled:enabled}});}}'
            '}'
            '}));'
            '}catch(__e_ts){console.error("[VisualVibe] Failed to register timestamp toggle:",__e_ts);}'
        )
        s = tracker.tracked_replace(
            s,
            prov_anchor,
            prov_anchor + cmd_injection,
            name="inject-activate-timestamp-command",
            critical=True
        )
    else:
        print("[Init] ERROR: Could not find provider activation anchor in extension.js")
        return False

    # 2. Patch getHtmlContent method header to read showTimestamps setting
    # In 3.90.0: async getHtmlContent(r){ ; in 3.92.0: getHtmlContent(r){
    gh_match = re.search(r"((?:async\s+)?getHtmlContent\s*\([^)]*\)\s*\{)", s)
    if gh_match:
        gh_anchor = gh_match.group(1)
        gh_injection = (
            gh_anchor
            + 'let __vvShowTs=true;try{const _vsc=(typeof vscode!=="undefined"?vscode:require("vscode"));__vvShowTs=_vsc.workspace.getConfiguration("zoo-code").get("showTimestamps",true);}catch(__e){}'
        )
        s = tracker.tracked_replace(
            s,
            gh_anchor,
            gh_injection,
            name="inject-getHtmlContent-state",
            critical=True
        )
    else:
        print("[Init] ERROR: Could not find getHtmlContent anchor in extension.js")
        return False

    # 3. Patch <body> to include initial class if enabled
    # Anchor: <body>\n            <noscript>
    body_anchor = '<body>\n            <noscript>'
    body_replacement = '<body class="${__vvShowTs?`vv-show-timestamps`:``}">\n            <noscript>'
    if body_anchor in s:
        s = tracker.tracked_replace(
            s,
            body_anchor,
            body_replacement,
            name="inject-body-show-timestamps-class",
            critical=True
        )
    else:
        print("[Init] ERROR: Could not find <body> noscript anchor in extension.js")
        return False

    # 4. Patch HTML before module script to inject CSS and helper script
    # Anchor: <div id="root"></div>\n            <script nonce="${h}" type="module" src="${o}"></script>
    html_target = '<div id="root"></div>\n            <script nonce="${h}" type="module" src="${o}"></script>'

    injected_html = (
        '<div id="root"></div>'
        + '\n            <style>'
        '.vv-timestamp{display:none;font-size:0.75rem;opacity:0.75;margin-left:8px;font-weight:normal;color:var(--vscode-descriptionForeground,rgba(255,255,255,0.7));user-select:none;vertical-align:middle;white-space:nowrap;}'
        '[data-vv-ts]{position:relative;}'
        '.vv-timestamp--fallback{position:absolute;top:6px;right:12px;margin-left:0;}'
        'body.vv-show-timestamps .vv-timestamp{display:inline-block!important;}'
        '</style>'
        '\n            <script nonce="${h}">'
        + MARKER_EXT
        + '\n'
        '(function(){'
        'window.__VV_SHOW_TIMESTAMPS__=${__vvShowTs?"true":"false"};'
        'if(window.__VV_SHOW_TIMESTAMPS__){document.body.classList.add("vv-show-timestamps");}'
        'function formatTs(ts){'
        'if(!ts)return"";'
        'var d=new Date(Number(ts));'
        'if(isNaN(d.getTime()))return"";'
        'var now=new Date();'
        'var isToday=d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()&&d.getDate()===now.getDate();'
        'var pad=function(n){return(n<10?"0":"")+n;};'
        'var timeStr=pad(d.getHours())+":"+pad(d.getMinutes());'
        'if(isToday){return timeStr;}'
        'var dateStr=pad(d.getDate())+"/"+pad(d.getMonth()+1)+"/"+d.getFullYear();'
        'return dateStr+" "+timeStr;'
        '}'
        'function updateTimestamps(){'
        'var rows=document.querySelectorAll(\'[data-vv-ts]:not(.vv-timestamp)\');'
        'rows.forEach(function(row){'
        'var ts=row.getAttribute("data-vv-ts");'
        'if(!ts)return;'
        'var existing=row.querySelector(".vv-timestamp");'
        'if(existing){'
        'if(existing.getAttribute("data-vv-ts")!==ts){existing.setAttribute("data-vv-ts",ts);existing.textContent=formatTs(ts);}'
        'return;'
        '}'
        'var header=row.querySelector(\'div[style*="align-items:center"][style*="gap:10px"]\');'
        'var span=document.createElement("span");'
        'span.className="vv-timestamp";'
        'span.setAttribute("data-vv-ts",ts);'
        'span.textContent=formatTs(ts);'
        'if(!span.textContent){return;}'
        'if(header){'
        'var titleSpan=header.querySelector("span");'
        'if(titleSpan){titleSpan.insertAdjacentElement("afterend",span);}'
        'else{header.appendChild(span);}'
        '}else{'
        'span.classList.add("vv-timestamp--fallback");'
        'row.appendChild(span);'
        '}'
        '});'
        '}'
        'window.addEventListener("message",function(event){'
        'var data=event.data;'
        'if(!data)return;'
        'if(data.type==="vvToggleTimestamps"){'
        'window.__VV_SHOW_TIMESTAMPS__=!!data.enabled;'
        'document.body.classList.toggle("vv-show-timestamps",window.__VV_SHOW_TIMESTAMPS__);'
        'if(window.__VV_SHOW_TIMESTAMPS__){updateTimestamps();}'
        '}'
        '});'
        'var observer=new MutationObserver(function(){updateTimestamps();});'
        'function startObserver(){'
        'var target=document.getElementById("root")||document.body;'
        'if(target){'
        'observer.observe(target,{childList:true,subtree:true});'
        'updateTimestamps();'
        '}else{setTimeout(startObserver,50);}'
        '}'
        'if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",startObserver);}'
        'else{startObserver();}'
        '})();'
        '</script>'
        '\n            <script nonce="${h}" type="module" src="${o}"></script>'
    )

    if html_target in s:
        s = tracker.tracked_replace(
            s,
            html_target,
            injected_html,
            name="inject-webview-html-timestamp-script",
            critical=True
        )
    else:
        print("[Init] ERROR: Could not find webview HTML root script target in extension.js")
        return False

    with open(ext_js, "w", encoding="utf-8") as f:
        f.write(s)

    # Validazione sintattica
    if not check_js_syntax(ext_js):
        print("[Init] CRITICAL: Syntax check failed on patched extension.js! Rolling back from .orig...")
        shutil.copy2(orig_backup, ext_js)
        return False

    try:
        shutil.chown(ext_js, user=VV_USER, group=VV_USER)
    except Exception:
        pass

    return True


def patch_webview_bundle(ext_dir: str) -> bool:
    """Patch the built webview bundle so ChatRow rows expose data-vv-ts.

    Verified against Zoo Code 3.90.0: the memoized ChatRow wrapper compiles to
        (0,K.jsx)(`div`,{className:`px-[15px] py-[10px] pr-[6px]`,children:(0,K.jsx)(bxn,{...e})})
    where ``e`` is the props object, so ``e.message.ts`` is the real message timestamp.
    """
    bundle_js = os.path.join(ext_dir, "webview-ui", "build", "assets", "index.js")
    if not os.path.isfile(bundle_js):
        print("[Init] webview-ui/build/assets/index.js not found in", ext_dir)
        return False

    with open(bundle_js, "r", encoding="utf-8", errors="replace") as f:
        s = f.read()

    if MARKER_WEBVIEW in s:
        print(f"[Init] Zoo Code webview bundle timestamp patch ({MARKER_WEBVIEW}) already applied.")
        return True

    orig_backup = bundle_js + ".orig"
    if not os.path.isfile(orig_backup):
        shutil.copy2(bundle_js, orig_backup)

    chatrow_re = re.compile(
        r"(\(0,[a-zA-Z0-9_$]+\.jsx\)\([`\"]div[`\"],\{className:[`\"]px-\[15px\] py-\[10px\] pr-\[6px\][`\"]),children:(\(0,[a-zA-Z0-9_$]+\.jsx\)\([a-zA-Z0-9_$]+,\{\.\.\.e\}\)\}\))"
    )
    if chatrow_re.search(s):
        s = tracker.tracked_sub(
            chatrow_re,
            r'\1,"data-vv-ts":e.message?.ts,children:\2',
            s,
            name="inject-chatrow-data-vv-ts",
            critical=True,
            count=1
        )
    else:
        print("[Init] ERROR: Could not find ChatRow wrapper pattern in webview bundle")
        return False

    with open(bundle_js, "w", encoding="utf-8") as f:
        f.write(s)

    if not check_js_syntax(bundle_js):
        print("[Init] CRITICAL: Syntax check failed on patched webview bundle! Rolling back from .orig...")
        shutil.copy2(orig_backup, bundle_js)
        return False

    try:
        shutil.chown(bundle_js, user=VV_USER, group=VV_USER)
    except Exception:
        pass

    return True


def main():
    ext_dir = latest_zoo_ext_dir()
    if not ext_dir:
        print("[Init] Zoo Code extension dir not found; skipping timestamp patch.")
        return

    print(f"[Init] Found Zoo Code extension dir: {ext_dir}")

    ok_pkg = patch_package_json(ext_dir)
    if not ok_pkg:
        print("[Init] package.json patch failed.")

    ok_js = patch_extension_js(ext_dir)
    if not ok_js:
        print("[Init] extension.js patch failed.")

    ok_webview = patch_webview_bundle(ext_dir)
    if not ok_webview:
        print("[Init] webview bundle patch failed.")

    tracker.report()
    if tracker.has_critical_failures():
        sys.stderr.write("[Init] CRITICAL: Zoo Code timestamp display patching encountered critical failures!\n")
        sys.exit(1)

    print("[Init] Zoo Code timestamp display patch completed successfully.")


if __name__ == "__main__":
    main()
