#!/bin/bash
# 001_sync-extensions.sh — boot — restore Zoo Code + sync custom VisualVibe extensions
# into VSCodium and register them in extensions.json (idempotent).
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
elif [ -f /opt/visualvibe/scripts/lib/common.sh ]; then
    source /opt/visualvibe/scripts/lib/common.sh
fi

vv_init_strict

EXT_DIR="$VSCODIUM_EXTENSIONS"
mkdir -p "$EXT_DIR"

# 1. Install any staged VSIX files using codium CLI if available
if command -v codium >/dev/null 2>&1; then
    for vsix in "$VV_EXTENSIONS"/*.vsix; do
        if [ -f "$vsix" ]; then
            vv_log INFO "Installing $vsix via codium CLI..."
            runuser -u "$VV_USER" -- codium --extensions-dir "$EXT_DIR" --install-extension "$vsix" --force 2>/dev/null || true
        fi
    done
fi

# 2. Restore or copy staged unpacked extensions from VV_EXTENSIONS
if [ -d "$VV_EXTENSIONS" ]; then
    if ! ls -d "$EXT_DIR"/*zoo-code* >/dev/null 2>&1; then
        vv_log INFO "Restoring Zoo Code extension from $VV_EXTENSIONS..."
        cp -a "$VV_EXTENSIONS/." "$EXT_DIR/" 2>/dev/null || true
    fi
fi

# Helper function to sync a custom extension folder and register it in extensions.json
sync_custom_ext() {
    local ext_name="$1"
    local ext_id="$2"
    local version="$3"

    local src=""
    if [ -d "$VV_EXTENSIONS/visualvibe.${ext_name}-${version}" ]; then
        src="$VV_EXTENSIONS/visualvibe.${ext_name}-${version}"
    elif [ -d "$VV_EXTENSIONS/${ext_name}" ]; then
        src="$VV_EXTENSIONS/${ext_name}"
    fi

    if [ -n "$src" ]; then
        local target_dirname="visualvibe.${ext_name}-${version}"
        local target_dir="$EXT_DIR/$target_dirname"

        rm -rf "$target_dir" "$EXT_DIR/$ext_name"
        cp -a "$src" "$target_dir"

        # Register in extensions.json for VSCodium
        python3 - <<PYEOF
import json, os, time

ext_file = "$EXT_DIR/extensions.json"
entry = {
    "identifier": {
        "id": "$ext_id"
    },
    "version": "$version",
    "location": {
        "\$mid": 1,
        "path": "$target_dir",
        "scheme": "file"
    },
    "relativeLocation": "$target_dirname",
    "metadata": {
        "installedTimestamp": int(time.time() * 1000),
        "pinned": True
    }
}

data = []
if os.path.exists(ext_file):
    try:
        with open(ext_file, "r") as f:
            data = json.load(f)
    except Exception:
        data = []

data = [item for item in data if item.get("identifier", {}).get("id", "").lower() != "$ext_id".lower()]
data.append(entry)

with open(ext_file, "w") as f:
    json.dump(data, f, indent=2)
PYEOF
    fi
}

# Cleanup deprecated vv-nav-button extension from previous installations if present
if [ -d "$EXT_DIR/visualvibe.vv-nav-button-1.0.0" ] || [ -d "$EXT_DIR/vv-nav-button" ]; then
    rm -rf "$EXT_DIR"/visualvibe.vv-nav-button* "$EXT_DIR"/vv-nav-button 2>/dev/null || true
    python3 - <<PYEOF
import json, os
ext_file = "$EXT_DIR/extensions.json"
if os.path.exists(ext_file):
    try:
        with open(ext_file, "r") as f:
            data = json.load(f)
        data = [item for item in data if "vv-nav-button" not in item.get("identifier", {}).get("id", "").lower()]
        with open(ext_file, "w") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass
PYEOF
fi

sync_custom_ext "vv-project-picker" "visualvibe.vv-project-picker" "1.0.0"
sync_custom_ext "vv-update-checker" "visualvibe.vv-update-checker" "1.0.0"
sync_custom_ext "vv-telegram-bridge" "visualvibe.vv-telegram-bridge" "1.0.0"

# Fix ownership
chown -R "${VV_USER}:${VV_USER}" "$EXT_DIR" 2>/dev/null || true
vv_log INFO "Extensions sync completed."
