#!/bin/bash
# 013_kasmvnc-branding.sh — boot — brand KasmVNC web UI with VisualVibe Electron title & favicons.
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
elif [ -f /opt/visualvibe/scripts/lib/common.sh ]; then
    source /opt/visualvibe/scripts/lib/common.sh
fi

vv_init_strict

WWW_DIR="$KASMVNC_WWW_DIR"
MEDIA_DIR="$VV_MEDIA"

if [ ! -d "$WWW_DIR" ]; then
    vv_log WARN "$WWW_DIR not found, skipping web UI branding."
    exit 0
fi

if [ ! -d "$MEDIA_DIR" ]; then
    # Fallback to local media if running outside container
    MEDIA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../media" 2>/dev/null && pwd)"
fi

vv_log INFO "Applying VisualVibe Electron branding to KasmVNC Web UI..."

# 1. Copy Favicon assets to root of Web UI
install -m 644 "$MEDIA_DIR/favicon.ico" "$WWW_DIR/favicon.ico"
install -m 644 "$MEDIA_DIR/favicon.svg" "$WWW_DIR/favicon.svg"
install -m 644 "$MEDIA_DIR/favicon-32x32.png" "$WWW_DIR/favicon-32x32.png"
install -m 644 "$MEDIA_DIR/apple-touch-icon.png" "$WWW_DIR/apple-touch-icon.png"
mkdir -p "$WWW_DIR/assets"
if [ -f "$MEDIA_DIR/visualvibe_biglogo.jpg" ]; then
    install -m 644 "$MEDIA_DIR/visualvibe_biglogo.jpg" "$WWW_DIR/assets/visualvibe_biglogo.jpg"
fi
if [ -f "$MEDIA_DIR/visualvibe_horizontal.png" ]; then
    install -m 644 "$MEDIA_DIR/visualvibe_horizontal.png" "$WWW_DIR/assets/visualvibe_horizontal.png"
fi
if [ -f "$MEDIA_DIR/favicon.svg" ]; then
    install -m 644 "$MEDIA_DIR/favicon.svg" "$WWW_DIR/assets/favicon.svg"
fi
mkdir -p "$WWW_DIR/assets"
if [ -f "$MEDIA_DIR/visualvibe_horizontal.png" ]; then
    install -m 644 "$MEDIA_DIR/visualvibe_horizontal.png" "$WWW_DIR/assets/visualvibe_horizontal.png"
fi
if [ -f "$MEDIA_DIR/favicon.svg" ]; then
    install -m 644 "$MEDIA_DIR/favicon.svg" "$WWW_DIR/assets/favicon.svg"
fi

# 2. Overwrite icon assets in app/images/icons
ICONS_DIR="$WWW_DIR/app/images/icons"
if [ -d "$ICONS_DIR" ]; then
    install -m 644 "$MEDIA_DIR/favicon.ico" "$ICONS_DIR/favicon.ico"
    install -m 644 "$MEDIA_DIR/favicon.svg" "$ICONS_DIR/favicon.svg"
    install -m 644 "$MEDIA_DIR/favicon.svg" "$ICONS_DIR/novnc-icon.svg"
    install -m 644 "$MEDIA_DIR/favicon.svg" "$ICONS_DIR/novnc-icon-sm.svg"
    install -m 644 "$MEDIA_DIR/favicon.svg" "$ICONS_DIR/kasm_logo.svg"
    install -m 644 "$MEDIA_DIR/favicon.svg" "$ICONS_DIR/kasm_logo.svg"

    for f in "$ICONS_DIR"/368_kasm_logo_only_*.png "$ICONS_DIR"/novnc-*.png; do
        [ -e "$f" ] || continue
        fname=$(basename "$f")
        case "$fname" in
            *16x16*|*24x24*|*32x32*)
                install -m 644 "$MEDIA_DIR/favicon-32x32.png" "$f"
                ;;
            *192x192*|*256x256*|*512x512*)
                install -m 644 "$MEDIA_DIR/pwa-icon-192.png" "$f"
                ;;
            *)
                install -m 644 "$MEDIA_DIR/apple-touch-icon.png" "$f"
                ;;
        esac
    done
fi

# 3. Patch HTML titles and favicon links
for html_file in "$WWW_DIR/index.html" "$WWW_DIR/screen.html"; do
    if [ -f "$html_file" ]; then
        # Replace title tag
        sed -i 's/<title>KasmVNC<\/title>/<title>VisualVibe Electron<\/title>/g' "$html_file"
        # Ensure favicon.ico and favicon.svg are declared if not present
        if ! grep -q "favicon.ico" "$html_file"; then
            sed -i 's|<meta charset=utf-8>|<meta charset=utf-8><link rel="shortcut icon" href="favicon.ico"><link rel="icon" type="image/svg+xml" href="favicon.svg">|g' "$html_file"
        fi
    fi
done

# 4. Patch JS title constants and title updates in UI scripts
for js_file in "$WWW_DIR/app/ui.js" "$WWW_DIR/dist/main.bundle.js"; do
    if [ -f "$js_file" ]; then
        sed -i 's/const PAGE_TITLE = "KasmVNC";/const PAGE_TITLE = "VisualVibe Electron";/g' "$js_file"
        sed -i 's/var PAGE_TITLE = "KasmVNC";/var PAGE_TITLE = "VisualVibe Electron";/g' "$js_file"
        sed -i 's/PAGE_TITLE = "KasmVNC"/PAGE_TITLE = "VisualVibe Electron"/g' "$js_file"
        sed -i 's/document\.title = e\.detail\.name + " - " + PAGE_TITLE;/document.title = "VisualVibe Electron";/g' "$js_file"
        sed -i 's/document\.title=e\.detail\.name+" - "+PAGE_TITLE;/document.title="VisualVibe Electron";/g' "$js_file"
        sed -i 's/document\.title = e\.detail\.name + " - " + "KasmVNC";/document.title = "VisualVibe Electron";/g' "$js_file"
        sed -i 's/document\.title=e\.detail\.name+" - KasmVNC";/document.title="VisualVibe Electron";/g' "$js_file"
        sed -i 's/document\.title = PAGE_TITLE;/document.title = "VisualVibe Electron";/g' "$js_file"
        sed -i 's/document\.title=PAGE_TITLE;/document.title="VisualVibe Electron";/g' "$js_file"
        sed -i 's/ - KasmVNC//g' "$js_file"
    fi
done

vv_log INFO "Successfully branded KasmVNC web UI with 'VisualVibe Electron' and custom favicons."
