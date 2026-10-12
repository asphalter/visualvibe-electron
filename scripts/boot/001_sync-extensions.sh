#!/bin/bash
# 001_sync-extensions.sh — boot — restore Zoo Code + sync custom VisualVibe extensions
# into code-server and register them in extensions.json (idempotent).
set -e
# Restore or install Zoo Code extension into code-server extensions directory
mkdir -p /home/vvelectron/.local/share/code-server/extensions
if [ -d /opt/visualvibe/extensions ] && ! ls -d /home/vvelectron/.local/share/code-server/extensions/*zoo-code* >/dev/null 2>&1; then
    echo "[Extensions] Restoring Zoo Code extension from /opt/visualvibe/extensions..."
    cp -a /opt/visualvibe/extensions/. /home/vvelectron/.local/share/code-server/extensions/
fi
# Always sync the VisualVibe nav button extension (update on every container start)
if [ -d /opt/visualvibe/extensions/visualvibe.vv-nav-button-1.0.0 ] || [ -d /opt/visualvibe/extensions/vv-nav-button ]; then
    SRC_DIR="/opt/visualvibe/extensions/visualvibe.vv-nav-button-1.0.0"
    [ ! -d "$SRC_DIR" ] && SRC_DIR="/opt/visualvibe/extensions/vv-nav-button"
    TARGET_DIR="/home/vvelectron/.local/share/code-server/extensions/visualvibe.vv-nav-button-1.0.0"
    
    rm -rf "$TARGET_DIR" "/home/vvelectron/.local/share/code-server/extensions/vv-nav-button"
    cp -a "$SRC_DIR" "$TARGET_DIR"

    # Register in extensions.json so code-server recognizes the installed extension
    python3 - <<'PYEOF'
import json, os, time

ext_file = "/home/vvelectron/.local/share/code-server/extensions/extensions.json"
ext_dir = "/home/vvelectron/.local/share/code-server/extensions"
entry = {
    "identifier": {
        "id": "visualvibe.vv-nav-button"
    },
    "version": "1.0.0",
    "location": {
        "$mid": 1,
        "path": "/home/vvelectron/.local/share/code-server/extensions/visualvibe.vv-nav-button-1.0.0",
        "scheme": "file"
    },
    "relativeLocation": "visualvibe.vv-nav-button-1.0.0",
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

# Remove old entry if present and append new
data = [item for item in data if item.get("identifier", {}).get("id", "").lower() != "visualvibe.vv-nav-button"]
data.append(entry)

with open(ext_file, "w") as f:
    json.dump(data, f, indent=2)
PYEOF
fi

# Always sync the VisualVibe projects picker extension (update on every container start)
if [ -d /opt/visualvibe/extensions/visualvibe.vv-project-picker-1.0.0 ] || [ -d /opt/visualvibe/extensions/vv-project-picker ]; then
    SRC_DIR="/opt/visualvibe/extensions/visualvibe.vv-project-picker-1.0.0"
    [ ! -d "$SRC_DIR" ] && SRC_DIR="/opt/visualvibe/extensions/vv-project-picker"
    TARGET_DIR="/home/vvelectron/.local/share/code-server/extensions/visualvibe.vv-project-picker-1.0.0"

    rm -rf "$TARGET_DIR" "/home/vvelectron/.local/share/code-server/extensions/vv-project-picker"
    cp -a "$SRC_DIR" "$TARGET_DIR"

    # Register in extensions.json so code-server recognizes the installed extension
    python3 - <<'PYEOF'
import json, os, time

ext_file = "/home/vvelectron/.local/share/code-server/extensions/extensions.json"
ext_dir = "/home/vvelectron/.local/share/code-server/extensions"
entry = {
    "identifier": {
        "id": "visualvibe.vv-project-picker"
    },
    "version": "1.0.0",
    "location": {
        "$mid": 1,
        "path": "/home/vvelectron/.local/share/code-server/extensions/visualvibe.vv-project-picker-1.0.0",
        "scheme": "file"
    },
    "relativeLocation": "visualvibe.vv-project-picker-1.0.0",
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

# Remove old entry if present and append new
data = [item for item in data if item.get("identifier", {}).get("id", "").lower() != "visualvibe.vv-project-picker"]
data.append(entry)

with open(ext_file, "w") as f:
    json.dump(data, f, indent=2)
PYEOF
fi

# Always sync the VisualVibe update checker extension (update on every container start)
if [ -d /opt/visualvibe/extensions/visualvibe.vv-update-checker-1.0.0 ] || [ -d /opt/visualvibe/extensions/vv-update-checker ]; then
    SRC_DIR="/opt/visualvibe/extensions/visualvibe.vv-update-checker-1.0.0"
    [ ! -d "$SRC_DIR" ] && SRC_DIR="/opt/visualvibe/extensions/vv-update-checker"
    TARGET_DIR="/home/vvelectron/.local/share/code-server/extensions/visualvibe.vv-update-checker-1.0.0"

    rm -rf "$TARGET_DIR" "/home/vvelectron/.local/share/code-server/extensions/vv-update-checker"
    cp -a "$SRC_DIR" "$TARGET_DIR"

    # Register in extensions.json so code-server recognizes the installed extension
    python3 - <<'PYEOF'
import json, os, time

ext_file = "/home/vvelectron/.local/share/code-server/extensions/extensions.json"
ext_dir = "/home/vvelectron/.local/share/code-server/extensions"
entry = {
    "identifier": {
        "id": "visualvibe.vv-update-checker"
    },
    "version": "1.0.0",
    "location": {
        "$mid": 1,
        "path": "/home/vvelectron/.local/share/code-server/extensions/visualvibe.vv-update-checker-1.0.0",
        "scheme": "file"
    },
    "relativeLocation": "visualvibe.vv-update-checker-1.0.0",
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

# Remove old entry if present and append new
data = [item for item in data if item.get("identifier", {}).get("id", "").lower() != "visualvibe.vv-update-checker"]
data.append(entry)

with open(ext_file, "w") as f:
    json.dump(data, f, indent=2)
PYEOF
fi

chown -R vvelectron:vvelectron /home/vvelectron/.local/share/code-server/extensions 2>/dev/null || true
