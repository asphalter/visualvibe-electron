#!/bin/bash
# 003_vscodium-settings.sh — build — pre-seed VSCodium User
# settings.json and keybindings.json (telemetry off, workspace trust disabled, fonts, Zoo Code shortcuts).
# Re-applied at boot by boot/009_sync-settings.sh on the persistent volume.
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
elif [ -f /opt/visualvibe/scripts/lib/common.sh ]; then
    source /opt/visualvibe/scripts/lib/common.sh
fi

vv_init_strict

mkdir -p "$VSCODIUM_USER_DIR"
mkdir -p "$VSCODIUM_DATA"

# Pre-populate argv.json to pre-select basic password-store (weak encryption)
cat > "$VSCODIUM_DATA/argv.json" <<'ARGV_JSON'
{
  "password-store": "basic"
}
ARGV_JSON

cp "$VSCODIUM_DATA/argv.json" "$VSCODIUM_CONFIG/argv.json"

cat > /tmp/default-settings.json <<'SETTINGS_JSON'
{
  "window.title": "VisualVibe Electron",
  "window.titleBarStyle": "custom",
  "window.menuBarVisibility": "classic",
  "editor.formatOnSave": false,
  "editor.minimap.enabled": false,
  "editor.fontFamily": "'Liberation Mono', 'DejaVu Sans Mono', monospace",
  "editor.fontSize": 14,
  "telemetry.telemetryLevel": "off",
  "extensions.autoUpdate": false,
  "security.workspace.trust.enabled": false,
  "security.workspace.trust.startupPrompt": "never",
  "workbench.startupEditor": "none",
  "workbench.welcomePage.walkthroughs.openOnInstall": false,
  "workbench.secondarySideBar.defaultVisibility": "visible",
  "workbench.sideBar.location": "left",
  "workbench.layoutControl.enabled": true,
  "workbench.colorTheme": "Default Dark Modern",
  "window.restoreWindows": "all"
}
SETTINGS_JSON

cat > /tmp/default-keybindings.json <<'KEYS_JSON'
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

cp /tmp/default-settings.json "$VSCODIUM_USER_DIR/settings.json"
cp /tmp/default-keybindings.json "$VSCODIUM_USER_DIR/keybindings.json"
chown -R "${VV_USER}:${VV_USER}" "$VV_HOME"
vv_log INFO "Pre-seeded settings.json and keybindings.json."
rm -f /tmp/default-settings.json /tmp/default-keybindings.json
