#!/bin/bash
# 009_sync-settings.sh — boot — enforce VSCodium settings.json and keybindings.json
# on the persistent volume (idempotent).
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
elif [ -f /opt/visualvibe/scripts/lib/common.sh ]; then
    source /opt/visualvibe/scripts/lib/common.sh
fi

vv_init_strict

# Pre-configure VSCodium settings
python3 << 'PYEOF'
import json, os, sys
sys.path.insert(0, os.environ.get("VV_LIB_DIR", "/opt/visualvibe/scripts/lib"))
from vv_common import VV_HOME, VV_BASE, VV_WORKDIRS, VSCODIUM_CONFIG, VSCODIUM_DATA, VSCODIUM_USER_DIR

target_dirs = [
    VSCODIUM_USER_DIR,
]

# Determine VisualVibe version from VERSION file
vv_ver = ""
for vpath in (os.path.join(VV_BASE, "VERSION"), os.path.join(VV_WORKDIRS, "VisualVibe Electron/VERSION")):
    if os.path.exists(vpath):
        try:
            with open(vpath, "r", encoding="utf-8") as vf:
                vv_ver = vf.read().strip()
            if vv_ver:
                break
        except Exception:
            pass

title_str = f"VisualVibe Electron v{vv_ver}" if vv_ver else "VisualVibe Electron"

for user_dir in target_dirs:
    os.makedirs(user_dir, exist_ok=True)
    settings_path = os.path.join(user_dir, "settings.json")
    current = {}
    if os.path.exists(settings_path):
        try:
            with open(settings_path, "r", encoding="utf-8") as f:
                current = json.load(f)
        except Exception:
            current = {}

    current.update({
        "window.title": title_str,
        "window.titleBarStyle": "custom",
        "window.menuBarVisibility": "classic",
        "editor.formatOnSave": False,
        "editor.minimap.enabled": False,
        "editor.fontFamily": "'Liberation Mono', 'DejaVu Sans Mono', monospace",
        "editor.fontSize": 14,
        "telemetry.telemetryLevel": "off",
        "extensions.autoUpdate": False,
        "security.workspace.trust.enabled": False,
        "security.workspace.trust.startupPrompt": "never",
        "workbench.startupEditor": "none",
        "workbench.welcomePage.walkthroughs.openOnInstall": False,
        "workbench.secondarySideBar.defaultVisibility": "visible",
        "workbench.sideBar.location": "left",
        "workbench.layoutControl.enabled": True,
        "workbench.colorTheme": "Default Dark Modern",
        "window.restoreWindows": "all",
        "visualvibe.version": vv_ver or "dev"
    })

    with open(settings_path, "w", encoding="utf-8") as f:
        json.dump(current, f, indent=2)

    # Keybindings (Zoo Code shortcuts: ctrl+alt+c and ctrl+alt+b)
    keybindings_path = os.path.join(user_dir, "keybindings.json")
    desired_keys = [
        {
            "key": "ctrl+alt+c",
            "command": "workbench.view.extension.zoo-code-ActivityBar"
        },
        {
            "key": "ctrl+alt+b",
            "command": "workbench.action.toggleAuxiliaryBar"
        }
    ]
    with open(keybindings_path, "w", encoding="utf-8") as f:
        json.dump(desired_keys, f, indent=2)

# Enforce argv.json to pre-select basic password-store (weak encryption)
for argv_dir in [VSCODIUM_DATA, VSCODIUM_CONFIG]:
    os.makedirs(argv_dir, exist_ok=True)
    argv_path = os.path.join(argv_dir, "argv.json")
    argv_data = {}
    if os.path.exists(argv_path):
        try:
            with open(argv_path, "r", encoding="utf-8") as f:
                argv_data = json.load(f)
        except Exception:
            argv_data = {}
    argv_data["password-store"] = "basic"
    with open(argv_path, "w", encoding="utf-8") as f:
        json.dump(argv_data, f, indent=2)

PYEOF

chown -R "${VV_USER}:${VV_USER}" "$VSCODIUM_CONFIG" "$VSCODIUM_DATA" 2>/dev/null || true
vv_log INFO "Enforced settings.json and keybindings.json."
