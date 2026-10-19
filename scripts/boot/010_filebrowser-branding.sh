#!/bin/bash
# 010_filebrowser-branding.sh — boot — overwrite FileBrowser auto-generated PWA
# icons with VisualVibe branding right after FileBrowser has finished starting.
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
elif [ -f /opt/visualvibe/scripts/lib/common.sh ]; then
    source /opt/visualvibe/scripts/lib/common.sh
fi

vv_init_strict

# FileBrowser Quantum regenerates these icons on every startup, so we replace
# them right after it has finished starting (and after icon generation).
FB_ICON_DIR="${VV_HOME}/.cache/filebrowser/icons"
for _ in $(seq 1 20); do
    if [ -d "$FB_ICON_DIR" ] && [ -f "$FB_ICON_DIR/pwa-icon-512.png" ]; then
        break
    fi
    sleep 0.5
done
if [ -d "$FB_ICON_DIR" ]; then
    install -o "$VV_USER" -g "$VV_USER" -m 644 \
        "${VV_MEDIA}/apple-touch-icon.png" "$FB_ICON_DIR/apple-touch-icon.png"
    install -o "$VV_USER" -g "$VV_USER" -m 644 \
        "${VV_MEDIA}/favicon-32x32.png" "$FB_ICON_DIR/favicon-32x32.png"
    install -o "$VV_USER" -g "$VV_USER" -m 644 \
        "${VV_MEDIA}/pwa-icon-192.png" "$FB_ICON_DIR/pwa-icon-192.png"
    install -o "$VV_USER" -g "$VV_USER" -m 644 \
        "${VV_MEDIA}/pwa-icon-256.png" "$FB_ICON_DIR/pwa-icon-256.png"
    install -o "$VV_USER" -g "$VV_USER" -m 644 \
        "${VV_MEDIA}/pwa-icon-512.png" "$FB_ICON_DIR/pwa-icon-512.png"
    # Verify the icons were successfully overwritten with the VisualVibe source
    if cmp -s "${VV_MEDIA}/pwa-icon-512.png" "$FB_ICON_DIR/pwa-icon-512.png"; then
        vv_log INFO "Applied and verified VisualVibe favicon branding."
    else
        vv_log WARN "VisualVibe favicon branding could not be verified."
    fi
else
    vv_log DEBUG "FileBrowser icon cache directory not created yet (first run?); skipping favicon branding for this boot."
fi

