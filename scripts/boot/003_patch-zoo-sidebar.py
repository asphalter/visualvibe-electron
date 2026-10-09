#!/usr/bin/env python3
"""
003_patch-zoo-sidebar.py — boot — move Zoo Code to the Secondary Side Bar (right)
by patching its package.json viewsContainers (activitybar → secondarySidebar).
Zoo Code auto-activates via onStartupFinished, so no activationEvents patch is needed.
"""
import sys, os
sys.path.insert(0, "/opt/visualvibe/scripts/lib")
from vv_common import HOME, latest_zoo_ext_dir
import json

_ext_dir = latest_zoo_ext_dir()
for pkg_path in ([os.path.join(_ext_dir, "package.json")] if _ext_dir else []):
    try:
        with open(pkg_path, "r", encoding="utf-8") as f:
            pkg = json.load(f)
        modified = False
        vc = pkg.get("contributes", {}).get("viewsContainers", {})
        if "activitybar" in vc:
            vc["secondarySidebar"] = vc.pop("activitybar")
            modified = True
        if modified:
            with open(pkg_path, "w", encoding="utf-8") as f:
                json.dump(pkg, f, indent=2)
            print("[Init] Patched Zoo Code package.json: moved view container to secondarySidebar.")
        else:
            print("[Init] Zoo Code package.json already in secondarySidebar (or container not found).")
    except Exception as e:
        print(f"[Init] Warning: Could not patch Zoo Code package.json: {e}")
