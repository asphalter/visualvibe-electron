#!/usr/bin/env python3
"""
004_patch-workbench-activitybar.py — boot — force "VisualVibe Projects" to the front
of the Activity Bar by patching code-server's workbench.js at 5 choke points, then
verify all anchors landed (fail-loud on a code-server version mismatch).
"""
import os
import json
import glob

# ── Diagnostics: log code-server / VS Code versions (anchor mismatch context) ──
try:
    _vs_pkg = "/usr/lib/code-server/lib/vscode/package.json"
    _cs_pkg = "/usr/lib/code-server/package.json"
    _vs_ver = "unknown"
    _cs_ver = "unknown"
    if os.path.exists(_vs_pkg):
        with open(_vs_pkg, "r", encoding="utf-8") as _f:
            _vs_ver = json.load(_f).get("version", "unknown")
    if os.path.exists(_cs_pkg):
        with open(_cs_pkg, "r", encoding="utf-8") as _f:
            _cs_ver = json.load(_f).get("version", "unknown")
    print(f"[Init] code-server version: {_cs_ver}  (VS Code {_vs_ver})")
except Exception:
    pass

# ── Apply the 7 Activity Bar patches ─────────────────────────────────────────
for wb_path in glob.glob("/usr/lib/code-server/lib/vscode/out/vs/code/browser/workbench/workbench.js"):
    try:
        with open(wb_path, "r", encoding="utf-8") as f:
            wb_content = f.read()
        wb_modified = False

        # 1. Force shouldBeHidden() to never hide visualvibe-projects so position 0 is preserved.
        old_hidden = 'shouldBeHidden(e,t){let i=Oe(e)?this.getViewContainer(e):e,n=Oe(e)?e:e.id;'
        new_hidden = 'shouldBeHidden(e,t){let i=Oe(e)?this.getViewContainer(e):e,n=Oe(e)?e:e.id;if(n==="workbench.view.extension.visualvibe-projects")return!1;'
        if old_hidden in wb_content:
            wb_content = wb_content.replace(old_hidden, new_hidden, 1)
            wb_modified = True
            print("[Init] Patched code-server workbench: visualvibe-projects will never be hidden.")
        elif new_hidden in wb_content:
            print("[Init] code-server workbench already patched (visualvibe-projects visibility).")
        else:
            print("[Init] Warning: code-server workbench shouldBeHidden anchor not found.")

        # 2. In addComposite(), force order: -1 and requestedIndex: 0 so runtime registration does not overwrite order.
        old_add = 'addComposite(e){this.compositeBar.addComposite({id:e.id,name:typeof e.title=="string"?e.title:e.title.value,order:e.order,requestedIndex:e.requestedIndex})}'
        new_add = 'addComposite(e){this.compositeBar.addComposite({id:e.id,name:typeof e.title=="string"?e.title:e.title.value,order:e.id==="workbench.view.extension.visualvibe-projects"?-1:e.order,requestedIndex:e.id==="workbench.view.extension.visualvibe-projects"?0:e.requestedIndex})}'
        if old_add in wb_content:
            wb_content = wb_content.replace(old_add, new_add, 1)
            wb_modified = True
            print("[Init] Patched code-server workbench: addComposite projects requestedIndex set to 0 and order set to -1.")
        elif new_add in wb_content:
            print("[Init] code-server workbench already patched (addComposite requestedIndex).")
        else:
            print("[Init] Warning: code-server workbench addComposite anchor not found.")

        # 3. In registerCustomViewContainers, pass order: -1 directly for visualvibe-projects instead of t++
        old_reg = 'p=this.registerCustomViewContainer(l,u,c,t++,e.identifier,n)'
        new_reg = 'p=this.registerCustomViewContainer(l,u,c,r.id==="visualvibe-projects"?-1:t++,e.identifier,n)'
        if old_reg in wb_content:
            wb_content = wb_content.replace(old_reg, new_reg, 1)
            wb_modified = True
            print("[Init] Patched code-server workbench: registerCustomViewContainer projects order set to -1.")
        elif new_reg in wb_content:
            print("[Init] code-server workbench already patched (registerCustomViewContainer projects order).")
        else:
            print("[Init] Warning: code-server workbench registerCustomViewContainer anchor not found.")

        # 4. In CompositeBarModel.prototype.add, ensure visualvibe-projects is always unshifted to index 0
        old_model_add = 'add(o,e,t,i){let n=this.findItem(o);if(n){let r=!1;'
        new_model_add = (
            'add(o,e,t,i){let n=this.findItem(o);if(n){let r=!1;'
            'if(o==="workbench.view.extension.visualvibe-projects"){'
            'let x=this.items.indexOf(n);'
            'if(x>0){this.items.splice(x,1);this.items.unshift(n);r=!0}}'
        )
        if old_model_add in wb_content:
            wb_content = wb_content.replace(old_model_add, new_model_add, 1)
            wb_modified = True
            print("[Init] Patched code-server workbench: CompositeBarModel forces visualvibe-projects to index 0.")
        elif new_model_add in wb_content:
            print("[Init] code-server workbench already patched (CompositeBarModel projects position).")
        else:
            print("[Init] Warning: code-server workbench CompositeBarModel add anchor not found.")

        # 5. Force visualvibe-projects to the front of getPinnedViewContainers() so a persisted
        #    client-side order (IndexedDB) can never demote it below the other viewlets.
        old_getpinned = 'getPinnedViewContainers(){return JSON.parse(this.pinnedViewContainersValue)}'
        new_getpinned = 'getPinnedViewContainers(){let v=JSON.parse(this.pinnedViewContainersValue),i=v.findIndex(x=>x.id==="workbench.view.extension.visualvibe-projects");if(i>0){let p=v.splice(i,1)[0];v.unshift(p)}return v}'
        if old_getpinned in wb_content:
            wb_content = wb_content.replace(old_getpinned, new_getpinned, 1)
            wb_modified = True
            print("[Init] Patched code-server workbench: getPinnedViewContainers forces visualvibe-projects to index 0.")
        elif new_getpinned in wb_content:
            print("[Init] code-server workbench already patched (getPinnedViewContainers projects position).")
        else:
            print("[Init] Warning: code-server workbench getPinnedViewContainers anchor not found.")

        if wb_modified:
            with open(wb_path, "w", encoding="utf-8") as f:
                f.write(wb_content)
    except Exception as e:
        print(f"[Init] Warning: Could not patch code-server workbench.js: {e}")

# ── Verify all 5 anchors actually landed (fail-loud on version mismatch) ─────
_expected_patches = [
    ("shouldBeHidden",             'if(n==="workbench.view.extension.visualvibe-projects")return!1'),
    ("addComposite",               'requestedIndex:e.id==="workbench.view.extension.visualvibe-projects"?0:e.requestedIndex'),
    ("registerCustomViewContainer", 'r.id==="visualvibe-projects"?-1:t++'),
    ("CompositeBarModel.add",      'if(o==="workbench.view.extension.visualvibe-projects"){let x=this.items.indexOf(n)'),
    ("getPinnedViewContainers",    'x.id==="workbench.view.extension.visualvibe-projects"'),
]
for _wbv in glob.glob("/usr/lib/code-server/lib/vscode/out/vs/code/browser/workbench/workbench.js"):
    try:
        with open(_wbv, "r", encoding="utf-8") as _f:
            _wbv_content = _f.read()
        _missing = [name for name, needle in _expected_patches if needle not in _wbv_content]
        if _missing:
            print(f"[Init] ERROR: workbench.js Activity Bar patch FAILED — missing: {', '.join(_missing)}")
        else:
            print(f"[Init] OK: workbench.js Activity Bar patches verified ({len(_expected_patches)}/{len(_expected_patches)} applied).")
    except Exception as _e:
        print(f"[Init] ERROR: could not verify workbench.js patches: {_e}")
