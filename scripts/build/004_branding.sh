#!/bin/bash
# 004_branding.sh — build — apply VisualVibe brand identity to code-server:
# favicon + PWA icons, PWA manifest name/short_name, and the workbench icon/CSS
# (via brand_workbench.py). Re-applied at boot by boot/009_sync-settings.sh.
set -e

# Favicons (login page)
install -m 644 /opt/visualvibe/media/favicon.ico \
    /usr/lib/code-server/src/browser/media/favicon.ico
install -m 644 /opt/visualvibe/media/favicon.svg \
    /usr/lib/code-server/src/browser/media/favicon.svg
install -m 644 /opt/visualvibe/media/favicon-dark-support.svg \
    /usr/lib/code-server/src/browser/media/favicon-dark-support.svg

# PWA icons (editor workbench)
install -m 644 /opt/visualvibe/media/pwa-icon-192.png \
    /usr/lib/code-server/lib/vscode/resources/server/code-192.png
install -m 644 /opt/visualvibe/media/pwa-icon-512.png \
    /usr/lib/code-server/lib/vscode/resources/server/code-512.png

# PWA manifest name / short_name
python3 - <<'PYEOF'
import json
manifest = "/usr/lib/code-server/lib/vscode/resources/server/manifest.json"
with open(manifest) as f:
    data = json.load(f)
data["name"] = "VisualVibe Electron"
data["short_name"] = "VisualVibe"
with open(manifest, "w") as f:
    json.dump(data, f, indent="\t")
    f.write("\n")
PYEOF

# Workbench icon + CSS overrides (top-left app icon only)
python3 -B /opt/visualvibe/scripts/brand_workbench.py
rm -rf /opt/visualvibe/scripts/__pycache__
