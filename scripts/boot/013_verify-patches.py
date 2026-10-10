#!/usr/bin/env python3
"""
013_verify-patches.py — boot & diagnostic — Centralized fail-loud verification of all
runtime patches applied to code-server and Zoo Code.

Exits with code 0 if all patches are verified, or code 1 if any patch is missing/broken.
"""
import sys
import os
import json

sys.path.insert(0, "/opt/visualvibe/scripts/lib")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))

try:
    from vv_common import latest_zoo_ext_dir
    from patch_anchors import (
        CODE_SERVER_WORKBENCH_PATH,
        WORKBENCH_PATCH_VERIFICATIONS,
        ZOO_CODE_VERIFICATIONS,
    )
except ImportError as err:
    print(f"[PatchVerify] FATAL: Cannot import verification registry: {err}")
    sys.exit(1)


def verify_workbench():
    failures = []
    if not os.path.exists(CODE_SERVER_WORKBENCH_PATH):
        return [f"Workbench file not found: {CODE_SERVER_WORKBENCH_PATH}"]

    try:
        with open(CODE_SERVER_WORKBENCH_PATH, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception as err:
        return [f"Cannot read workbench file: {err}"]

    for item in WORKBENCH_PATCH_VERIFICATIONS:
        sub = item["expected_substring"]
        if sub not in content:
            failures.append(f"Missing patch [{item['id']}]: {item['description']}")

    return failures


def verify_zoo():
    failures = []
    zoo_dir = latest_zoo_ext_dir()
    if not zoo_dir or not os.path.exists(zoo_dir):
        return ["Zoo Code extension directory not found in extensions path"]

    # 1. Check package.json (secondarySidebar)
    pkg_path = os.path.join(zoo_dir, "package.json")
    if not os.path.exists(pkg_path):
        failures.append(f"Zoo Code package.json not found: {pkg_path}")
    else:
        try:
            with open(pkg_path, "r", encoding="utf-8") as f:
                pkg_data = json.load(f)
            vc = pkg_data.get("contributes", {}).get("viewsContainers", {})
            if "secondarySidebar" not in vc:
                failures.append("Zoo Code package.json does not have 'secondarySidebar' in viewsContainers")
        except Exception as err:
            failures.append(f"Cannot parse Zoo Code package.json: {err}")

    # 2. Check extension.js (profiles seed v8 marker)
    ext_js = os.path.join(zoo_dir, "dist", "extension.js")
    if not os.path.exists(ext_js):
        failures.append(f"Zoo Code extension.js not found: {ext_js}")
    else:
        try:
            with open(ext_js, "r", encoding="utf-8", errors="replace") as f:
                js_content = f.read()
            marker = "/*[VisualVibe profiles seed v8]*/"
            if marker not in js_content:
                # Also accept v7 if not yet refreshed by boot cycle
                if "/*[VisualVibe profiles seed" not in js_content:
                    failures.append(f"Zoo Code extension.js missing profiles seed marker ({marker})")
        except Exception as err:
            failures.append(f"Cannot read Zoo Code extension.js: {err}")

    return failures


def main():
    print("[PatchVerify] Running centralized runtime patch verification...")
    all_failures = []

    wb_failures = verify_workbench()
    if wb_failures:
        print(f"[PatchVerify] code-server workbench check: FAIL ({len(wb_failures)} issues)")
        for fail in wb_failures:
            print(f"  - {fail}")
        all_failures.extend(wb_failures)
    else:
        print(f"[PatchVerify] code-server workbench check: PASS ({len(WORKBENCH_PATCH_VERIFICATIONS)} patches verified)")

    zoo_failures = verify_zoo()
    if zoo_failures:
        print(f"[PatchVerify] Zoo Code extension check: FAIL ({len(zoo_failures)} issues)")
        for fail in zoo_failures:
            print(f"  - {fail}")
        all_failures.extend(zoo_failures)
    else:
        print("[PatchVerify] Zoo Code extension check: PASS (layout & seed verified)")

    if all_failures:
        print("[PatchVerify] ==========================================================")
        print(f"[PatchVerify] FATAL ERROR: {len(all_failures)} runtime patches failed verification!")
        print("[PatchVerify] An upstream code-server or extension update likely altered anchors.")
        print("[PatchVerify] ==========================================================")
        sys.exit(1)

    print("[PatchVerify] All runtime patches verified successfully.")
    sys.exit(0)


if __name__ == "__main__":
    main()
