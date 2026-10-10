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

        # 1. Force shouldBeHidden() to never hide visualvibe-projects and ALWAYS hide workbench.panel.chat (Copilot).
        old_hidden = 'shouldBeHidden(e,t){let i=Oe(e)?this.getViewContainer(e):e,n=Oe(e)?e:e.id;'
        prev_hidden = 'shouldBeHidden(e,t){let i=Oe(e)?this.getViewContainer(e):e,n=Oe(e)?e:e.id;if(n==="workbench.view.extension.visualvibe-projects")return!1;'
        target_hidden = 'shouldBeHidden(e,t){let i=Oe(e)?this.getViewContainer(e):e,n=Oe(e)?e:e.id;if(n==="workbench.view.extension.visualvibe-projects")return!1;if(n==="workbench.panel.chat")return!0;'
        if target_hidden in wb_content:
            print("[Init] code-server workbench already patched (projects visible, chat hidden).")
        elif prev_hidden in wb_content:
            wb_content = wb_content.replace(prev_hidden, target_hidden, 1)
            wb_modified = True
            print("[Init] Patched code-server workbench: workbench.panel.chat will always be hidden.")
        elif old_hidden in wb_content:
            wb_content = wb_content.replace(old_hidden, target_hidden, 1)
            wb_modified = True
            print("[Init] Patched code-server workbench: visualvibe-projects visible, workbench.panel.chat hidden.")
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

        # 5. Force visualvibe-projects to the front of getPinnedViewContainers() and filter out workbench.panel.chat
        old_getpinned = 'getPinnedViewContainers(){return JSON.parse(this.pinnedViewContainersValue)}'
        prev_getpinned = 'getPinnedViewContainers(){let v=JSON.parse(this.pinnedViewContainersValue),i=v.findIndex(x=>x.id==="workbench.view.extension.visualvibe-projects");if(i>0){let p=v.splice(i,1)[0];v.unshift(p)}return v}'
        target_getpinned = 'getPinnedViewContainers(){let v=JSON.parse(this.pinnedViewContainersValue).filter(x=>x.id!=="workbench.panel.chat"),i=v.findIndex(x=>x.id==="workbench.view.extension.visualvibe-projects");if(i>0){let p=v.splice(i,1)[0];v.unshift(p)}return v}'
        if target_getpinned in wb_content:
            print("[Init] code-server workbench already patched (getPinnedViewContainers projects position and chat filtered).")
        elif prev_getpinned in wb_content:
            wb_content = wb_content.replace(prev_getpinned, target_getpinned, 1)
            wb_modified = True
            print("[Init] Patched code-server workbench: getPinnedViewContainers filters out workbench.panel.chat.")
        elif old_getpinned in wb_content:
            wb_content = wb_content.replace(old_getpinned, target_getpinned, 1)
            wb_modified = True
            print("[Init] Patched code-server workbench: getPinnedViewContainers forces projects to index 0 and filters out chat.")
        else:
            print("[Init] Warning: code-server workbench getPinnedViewContainers anchor not found.")

        # 6. Unset isDefault on core Chat container registration so AuxiliaryBar does not pick it
        old_chat_reg = 'registerViewContainer({id:VY,title:F(9805,"Chat"),icon:zIn,ctorDescriptor:new li(wd,[VY,{mergeViewWithContainerWhenSingleView:!0}]),storageId:VY,hideIfEmpty:!0,order:1},2,{isDefault:!0,'
        new_chat_reg = 'registerViewContainer({id:VY,title:F(9805,"Chat"),icon:zIn,ctorDescriptor:new li(wd,[VY,{mergeViewWithContainerWhenSingleView:!0}]),storageId:VY,hideIfEmpty:!0,order:1},2,{isDefault:!1,'
        if old_chat_reg in wb_content:
            wb_content = wb_content.replace(old_chat_reg, new_chat_reg, 1)
            wb_modified = True
            print("[Init] Patched code-server workbench: Chat view container isDefault set to false.")
        elif new_chat_reg in wb_content:
            print("[Init] code-server workbench already patched (Chat isDefault false).")

        # 7. Do not register views under Chat container (with hideIfEmpty:true, container stays hidden)
        old_chat_views = 'me.as(dr.ViewsRegistry).registerViews([KIn],ZTe)'
        new_chat_views = 'me.as(dr.ViewsRegistry).registerViews([],ZTe)'
        if old_chat_views in wb_content:
            wb_content = wb_content.replace(old_chat_views, new_chat_views, 1)
            wb_modified = True
            print("[Init] Patched code-server workbench: Chat views registration neutralized.")
        elif new_chat_views in wb_content:
            print("[Init] code-server workbench already patched (Chat views neutralized).")

        # 8. Disable Copilot status bar entry
        old_status_entry = 'this.entry=this.statusbarService.addEntry(t,"chat.statusBarEntry"'
        new_status_entry = 'this.entry=null;if(false)this.entry=this.statusbarService.addEntry(t,"chat.statusBarEntry"'
        if old_status_entry in wb_content:
            wb_content = wb_content.replace(old_status_entry, new_status_entry, 1)
            wb_modified = True
            print("[Init] Patched code-server workbench: Chat/Copilot status bar entry disabled.")
        elif new_status_entry in wb_content:
            print("[Init] code-server workbench already patched (Chat status bar disabled).")

        if wb_modified:
            with open(wb_path, "w", encoding="utf-8") as f:
                f.write(wb_content)
    except Exception as e:
        print(f"[Init] Warning: Could not patch code-server workbench.js: {e}")

# ── Verify all anchors actually landed (fail-loud on version mismatch) ─────
_expected_patches = [
    ("shouldBeHidden",             'if(n==="workbench.view.extension.visualvibe-projects")return!1;if(n==="workbench.panel.chat")return!0;'),
    ("addComposite",               'requestedIndex:e.id==="workbench.view.extension.visualvibe-projects"?0:e.requestedIndex'),
    ("registerCustomViewContainer", 'r.id==="visualvibe-projects"?-1:t++'),
    ("CompositeBarModel.add",      'if(o==="workbench.view.extension.visualvibe-projects"){let x=this.items.indexOf(n)'),
    ("getPinnedViewContainers",    'x.id!=="workbench.panel.chat"'),
    ("chatIsDefaultFalse",         '{isDefault:!1,'),
    ("chatViewsNeutralized",       '.registerViews([],ZTe)'),
    ("chatStatusBarDisabled",      'this.entry=null;if(false)this.entry='),
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
