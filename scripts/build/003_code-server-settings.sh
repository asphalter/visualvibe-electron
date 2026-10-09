#!/bin/bash
# 003_code-server-settings.sh — build — pre-seed code-server User settings.json and
# keybindings.json (title, telemetry off, workspace trust disabled, Zoo Code shortcuts).
# Re-applied at boot by boot/009_sync-settings.sh on the persistent volume.
set -e

mkdir -p /home/vvelectron/.local/share/code-server/User

tee /home/vvelectron/.local/share/code-server/User/settings.json <<'SETTINGS_JSON'
{
  "window.title": "VisualVibe Electron",
  "editor.formatOnSave": false,
  "editor.minimap.enabled": false,
  "telemetry.telemetryLevel": "off",
  "extensions.autoUpdate": false,
  "security.workspace.trust.enabled": false,
  "security.workspace.trust.startupPrompt": "never",
  "workbench.startupEditor": "none",
  "workbench.welcomePage.walkthroughs.openOnInstall": false,
  "workbench.colorTheme": "Default Dark Modern"
}
SETTINGS_JSON

tee /home/vvelectron/.local/share/code-server/User/keybindings.json <<'KEYS_JSON'
[
  {
    "key": "ctrl+alt+c",
    "command": "workbench.view.extension.zoo-code-ActivityBar"
  },
  {
    "key": "ctrl+alt+b",
    "command": "workbench.action.toggleAuxiliaryBar"
  }
]
KEYS_JSON

chown -R vvelectron:vvelectron /home/vvelectron
