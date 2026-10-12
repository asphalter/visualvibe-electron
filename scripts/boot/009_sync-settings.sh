#!/bin/bash
# 009_sync-settings.sh — boot — re-apply VisualVibe workbench branding and enforce
# code-server settings.json / keybindings.json on the persistent volume (idempotent).
set -e

# Ensure VisualVibe workbench branding is active
if [ -f /opt/visualvibe/scripts/brand_workbench.py ]; then
    python3 -B /opt/visualvibe/scripts/brand_workbench.py >/dev/null 2>&1 || true
    rm -rf /opt/visualvibe/scripts/__pycache__ 2>/dev/null || true
fi

# Pre-configure code-server settings (telemetry, extensions, sidebar layout)
mkdir -p /home/vvelectron/.local/share/code-server/User
python3 << 'PYEOF'
import json, os

home = "/home/vvelectron"

settings_path = os.path.join(home, ".local/share/code-server/User/settings.json")
current = {}
if os.path.exists(settings_path):
    try:
        with open(settings_path, "r", encoding="utf-8") as f:
            current = json.load(f)
    except Exception:
        current = {}

# Determine VisualVibe version from VERSION file
vv_ver = ""
for vpath in ("/opt/visualvibe/VERSION", "/home/vvelectron/VisualVibe Workdirs/VisualVibe Electron/VERSION"):
    if os.path.exists(vpath):
        try:
            with open(vpath, "r", encoding="utf-8") as vf:
                vv_ver = vf.read().strip()
            if vv_ver:
                break
        except Exception:
            pass

current.update({
    "window.title": "VisualVibe Electron",
    "editor.formatOnSave": False,
    "editor.minimap.enabled": False,
    "telemetry.telemetryLevel": "off",
    "extensions.autoUpdate": False,
    "security.workspace.trust.enabled": False,
    "security.workspace.trust.startupPrompt": "never",
    "workbench.startupEditor": "none",
    "workbench.welcomePage.walkthroughs.openOnInstall": False,
    "workbench.secondarySideBar.defaultVisibility": "visible",
    "workbench.sideBar.location": "left",
    "workbench.colorTheme": "Default Dark Modern"
})

if vv_ver:
    current["visualvibe.version"] = vv_ver

# Remove stale Copilot chat settings left over from older images (the bundled
# GitHub Copilot Chat extension is now removed at build/boot time).
for _stale in ("chat.disableAIFeatures", "chat.commandCenter.enabled", "chat.agent.enabled"):
    current.pop(_stale, None)

with open(settings_path, "w", encoding="utf-8") as f:
    json.dump(current, f, indent=2)

# Shortcut to focus the Zoo Code view directly and toggle the auxiliary bar
keybindings_path = os.path.join(home, ".local/share/code-server/User/keybindings.json")
keybindings = [
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
    json.dump(keybindings, f, indent=2)
PYEOF

chown -R vvelectron:vvelectron /home/vvelectron/.local/share/code-server 2>/dev/null || true
chown -R vvelectron:vvelectron /home/vvelectron/.roo 2>/dev/null || true
