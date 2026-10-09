#!/bin/bash
# 010_filebrowser-branding.sh — boot — overwrite FileBrowser auto-generated PWA
# icons with VisualVibe branding right after FileBrowser has finished starting.
set -e
# FileBrowser Quantum regenerates these icons on every startup, so we replace
# them right after it has finished starting (and after icon generation).
FB_ICON_DIR="/home/vvelectron/.cache/filebrowser/icons"
for _ in $(seq 1 20); do
    [ -d "$FB_ICON_DIR" ] && [ -f "$FB_ICON_DIR/pwa-icon-512.png" ] && break
    sleep 0.5
done
if [ -d "$FB_ICON_DIR" ]; then
    install -o vvelectron -g vvelectron -m 644 \
        /opt/visualvibe/media/apple-touch-icon.png "$FB_ICON_DIR/apple-touch-icon.png"
    install -o vvelectron -g vvelectron -m 644 \
        /opt/visualvibe/media/favicon-32x32.png "$FB_ICON_DIR/favicon-32x32.png"
    install -o vvelectron -g vvelectron -m 644 \
        /opt/visualvibe/media/pwa-icon-192.png "$FB_ICON_DIR/pwa-icon-192.png"
    install -o vvelectron -g vvelectron -m 644 \
        /opt/visualvibe/media/pwa-icon-256.png "$FB_ICON_DIR/pwa-icon-256.png"
    install -o vvelectron -g vvelectron -m 644 \
        /opt/visualvibe/media/pwa-icon-512.png "$FB_ICON_DIR/pwa-icon-512.png"
    # Verify the icons were successfully overwritten with the VisualVibe source
    if cmp -s /opt/visualvibe/media/pwa-icon-512.png "$FB_ICON_DIR/pwa-icon-512.png"; then
        echo "[FileBrowser] Applied and verified VisualVibe favicon branding."
    else
        echo "[FileBrowser] WARNING: VisualVibe favicon branding could not be verified."
    fi
else
    echo "[FileBrowser] WARNING: icon cache directory not found; skipping favicon branding."
fi

