#!/usr/bin/env python3
"""
Customizes KasmVNC Web UI with VisualVibe Electron branding:
- Replaces KasmVNC favicons with VisualVibe Electron icons
- Sets tab title permanently to 'VisualVibe Electron'
- Replaces sidebar logo with VisualVibe Electron branding card
- Injects FileBrowser Quantum quick-link in the sidebar
- Removes Game Cursor Mode / Modalità cursore di gioco from sidebar
- Customizes transition / connecting splash screen with official VisualVibe Electron logo and 'Connecting...'
"""

import base64
import glob
import os
import re
import shutil
import sys

sys.path.insert(0, "/opt/visualvibe/scripts/lib")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
try:
    from vv_common import KASMVNC_WWW_DIR, VV_MEDIA, VV_BASE, PatchTracker, PatchResult
except ImportError:
    KASMVNC_WWW_DIR = os.environ.get("KASMVNC_WWW_DIR", "/usr/share/kasmvnc/www")
    VV_BASE = os.environ.get("VV_BASE", "/opt/visualvibe")
    VV_MEDIA = os.environ.get("VV_MEDIA", os.path.join(VV_BASE, "media"))
    from vv_common import PatchTracker, PatchResult

# Tested and validated with KasmVNC version 1.3.3.
# When upgrading KasmVNC in Containerfile (ARG KASMVNC_VERSION), this constant
# MUST be updated and all regex/replace patterns re-verified against new bundle files.
KASMVNC_COMPAT_VERSION = "1.3.3"

tracker = PatchTracker("005_kasmvnc_sidebar", compat_version=KASMVNC_COMPAT_VERSION)

WWW_DIR = KASMVNC_WWW_DIR

if not os.path.isdir(WWW_DIR):
    print(f"[Brand] Notice: {WWW_DIR} does not exist, skipping branding.")
    sys.exit(0)

assets_dir = os.path.join(WWW_DIR, "assets")
os.makedirs(assets_dir, exist_ok=True)

# 1. Resolve and copy VisualVibe Electron official icons
config_dir = os.path.dirname(os.path.abspath(__file__))

potential_main_logos = [
    os.path.join(VV_MEDIA, "favicon.svg"),
    os.path.join(VV_MEDIA, "favicon-32x32.png"),
    os.path.join(VV_MEDIA, "favicon.png"),
    os.path.join(config_dir, "../../media/favicon.svg"),
    os.path.join(config_dir, "../media/favicon.svg"),
    os.path.join(config_dir, "../../media/favicon-32x32.png"),
    os.path.join(config_dir, "../media/favicon-32x32.png"),
    os.path.join(config_dir, "media/favicon.svg"),
    os.path.join(config_dir, "media/favicon-32x32.png"),
    os.path.join(VV_BASE, "favicon.svg"),
]

potential_horizontal_logos = [
    os.path.join(VV_MEDIA, "visualvibe_horizontal.png"),
    os.path.join(config_dir, "../../media/visualvibe_horizontal.png"),
    os.path.join(config_dir, "../media/visualvibe_horizontal.png"),
    os.path.join(config_dir, "media/visualvibe_horizontal.png"),
    os.path.join(VV_BASE, "visualvibe_horizontal.png"),
]

potential_big_logos = [
    os.path.join(VV_MEDIA, "visualvibe_biglogo.jpg"),
    os.path.join(config_dir, "../../media/visualvibe_biglogo.jpg"),
    os.path.join(config_dir, "../media/visualvibe_biglogo.jpg"),
    os.path.join(config_dir, "media/visualvibe_biglogo.jpg"),
    os.path.join(VV_BASE, "visualvibe_biglogo.jpg"),
]

main_logo_path = next((p for p in potential_main_logos if os.path.isfile(p)), None)
horizontal_logo_path = next((p for p in potential_horizontal_logos if os.path.isfile(p)), None)
big_logo_path = next((p for p in potential_big_logos if os.path.isfile(p)), None)


def get_mime(path):
    """Return MIME type for a given file path based on extension."""
    ext = os.path.splitext(path)[1].lower()
    if ext in [".jpg", ".jpeg"]:
        return "image/jpeg"
    elif ext == ".svg":
        return "image/svg+xml"
    return "image/png"


def get_data_uri(path):
    """Return (data_uri, mime) for small icons only (favicon use).
    FIX C-01: Large images are served as static files, not Data URIs.
    This function is retained only for the favicon <link> tag,
    which requires a Data URI for reliable cross-browser support.
    For images >50KB, we fall back to the asset path.
    """
    if not path or not os.path.isfile(path):
        return None, None
    mime = get_mime(path)
    size = os.path.getsize(path)
    if size > 51200:  # 50 KB threshold — use file reference instead
        return None, mime
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    return f"data:{mime};base64,{b64}", mime

# FIX C-01: Copy images to assets/ and reference by URL path, not inline Data URI.
# Images can be several MB — embedding them inline in HTML causes multi-MB HTML documents.

logo_mime = "image/png"
logo_asset_url = "./assets/visualvibe.png"       # default fallback URL
horizontal_asset_url = None
favicon_data_uri = None                           # only used for <link rel="icon"> (small logo only)

if main_logo_path:
    ext = os.path.splitext(main_logo_path)[1].lower()
    logo_mime = get_mime(main_logo_path)
    dest_logo = os.path.join(assets_dir, f"visualvibe{ext}")
    shutil.copy2(main_logo_path, dest_logo)
    logo_asset_url = f"./assets/visualvibe{ext}"
    
    # Also save as favicon.svg in assets
    shutil.copy2(main_logo_path, os.path.join(assets_dir, "favicon.svg"))

    media_dir = os.path.dirname(main_logo_path)
    # Replace KasmVNC bundled logos with matching sharp multi-resolution favicons
    for kasm_logo in glob.glob(os.path.join(assets_dir, "368_kasm_logo_only_*.png")):
        m = re.search(r"(\d+x\d+)", os.path.basename(kasm_logo))
        copied = False
        if m:
            dim = m.group(1)
            matching_favicon = os.path.join(media_dir, f"favicon_{dim}.png")
            if os.path.isfile(matching_favicon):
                shutil.copy2(matching_favicon, kasm_logo)
                copied = True
        if not copied:
            fav_fallback = os.path.join(media_dir, "favicon_32x32.png")
            if os.path.isfile(fav_fallback):
                shutil.copy2(fav_fallback, kasm_logo)
            else:
                shutil.copy2(main_logo_path, kasm_logo)

    # Copy favicon.ico, favicon.svg and favicon pngs to assets and root www
    ico_src = os.path.join(media_dir, "favicon.ico")
    if os.path.isfile(ico_src):
        shutil.copy2(ico_src, os.path.join(assets_dir, "favicon.ico"))
        shutil.copy2(ico_src, os.path.join(WWW_DIR, "favicon.ico"))
    svg_src = os.path.join(media_dir, "favicon.svg")
    if os.path.isfile(svg_src):
        shutil.copy2(svg_src, os.path.join(assets_dir, "favicon.svg"))
        shutil.copy2(svg_src, os.path.join(WWW_DIR, "favicon.svg"))
    png32_src = os.path.join(media_dir, "favicon-32x32.png")
    if os.path.isfile(png32_src):
        shutil.copy2(png32_src, os.path.join(assets_dir, "favicon-32x32.png"))
        shutil.copy2(png32_src, os.path.join(assets_dir, "favicon.png"))
        shutil.copy2(png32_src, os.path.join(WWW_DIR, "favicon.png"))
    png192_src = os.path.join(media_dir, "pwa-icon-192.png")
    if os.path.isfile(png192_src):
        shutil.copy2(png192_src, os.path.join(assets_dir, "pwa-icon-192.png"))

    favicon_data_uri = "./assets/favicon.ico"
    size_kb = os.path.getsize(main_logo_path) // 1024
    print(f"[Brand] Main logo: {main_logo_path} ({size_kb} KB) → {logo_asset_url}")
else:
    favicon_data_uri = logo_asset_url
    print("[Brand] Notice: No primary VisualVibe Electron logo file found, using fallback path.")

if horizontal_logo_path:
    dest_horiz = os.path.join(assets_dir, "visualvibe_horizontal.png")
    shutil.copy2(horizontal_logo_path, dest_horiz)
    horizontal_asset_url = "./assets/visualvibe_horizontal.png"
    size_kb = os.path.getsize(horizontal_logo_path) // 1024
    print(f"[Brand] Horizontal logo: {horizontal_logo_path} ({size_kb} KB) → {dest_horiz}")
else:
    horizontal_asset_url = "./assets/visualvibe_horizontal.png"
    print("[Brand] Notice: Horizontal logo file not found, using default reference path ./assets/visualvibe_horizontal.png")

# Copy visualvibe_biglogo.jpg for splash / reconnect transition screen
big_logo_asset_url = "./assets/visualvibe_biglogo.jpg"
if big_logo_path:
    dest_big = os.path.join(assets_dir, "visualvibe_biglogo.jpg")
    shutil.copy2(big_logo_path, dest_big)
    size_kb = os.path.getsize(big_logo_path) // 1024
    print(f"[Brand] Big logo: {big_logo_path} ({size_kb} KB) → {dest_big}")
else:
    print("[Brand] Notice: Big logo file not found, using default reference path ./assets/visualvibe_biglogo.jpg")

# Ensure favicon.svg is copied to assets_dir and WWW_DIR
potential_svgs = [
    os.path.join(VV_MEDIA, "favicon.svg"),
    os.path.join(config_dir, "../../media/favicon.svg"),
    os.path.join(config_dir, "../media/favicon.svg"),
]
svg_path = next((p for p in potential_svgs if os.path.isfile(p)), None)
if svg_path:
    shutil.copy2(svg_path, os.path.join(assets_dir, "favicon.svg"))
    shutil.copy2(svg_path, os.path.join(WWW_DIR, "favicon.svg"))

# Replace KasmVNC's bundled kasm_logo.svg in icons folder if present
kasm_logo_svg = os.path.join(WWW_DIR, "app/images/icons/kasm_logo.svg")
if os.path.isfile(kasm_logo_svg):
    if svg_path and os.path.isfile(svg_path):
        shutil.copy2(svg_path, kasm_logo_svg)
        print(f"[Brand] Replaced {kasm_logo_svg} with {svg_path}")
    elif main_logo_path and os.path.isfile(main_logo_path):
        shutil.copy2(main_logo_path, kasm_logo_svg)
        print(f"[Brand] Replaced {kasm_logo_svg} with {main_logo_path}")

# 2. Splash Screen (Transition / Connecting) Configuration
splash_css = """
<style id="visualvibe-splash-style">
#noVNC_transition {
    position: fixed !important;
    top: 0 !important; left: 0 !important; bottom: 0 !important; right: 0 !important;
    background: #0e0e16 !important;
    background-color: #0e0e16 !important;
    background-image: none !important;
    color: #f1f5f9 !important;
    display: none;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    z-index: 50 !important;
    transition: opacity 0.8s ease-in-out !important;
}
:root.noVNC_loading #noVNC_transition,
:root.noVNC_connecting #noVNC_transition,
:root.noVNC_disconnecting #noVNC_transition,
:root.noVNC_reconnecting #noVNC_transition {
    display: flex !important;
}
#noVNC_transition_content {
    background-color: #0e0e16 !important;
}
.visualvibe-connect-logo-container {
    background-color: #0e0e16 !important;
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
    text-align: center;
    margin-bottom: 20px;
    display: block !important;
}
.visualvibe-connect-logo {
    width: 140px !important;
    height: 140px !important;
    max-width: 160px !important;
    max-height: 160px !important;
    margin: 0 auto 20px auto !important;
    display: block !important;
    object-fit: contain !important;
    filter: drop-shadow(0 4px 16px rgba(0, 0, 0, 0.4)) !important;
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
}
.noVNC_vv_title {
    color: #ffffff;
    font-size: 26px;
    font-weight: 600;
    letter-spacing: 0.5px;
    margin-top: 16px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
#noVNC_transition_text {
    color: #94a3b8 !important;
    font-size: 16px !important;
    font-weight: 500 !important;
    letter-spacing: 0.8px !important;
    margin-top: 14px !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
.noVNC_vv_spinner {
    display: inline-flex;
    gap: 6px;
    margin-top: 20px;
}
.noVNC_vv_spinner div {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #38bdf8;
    animation: vvBounce 1.4s infinite ease-in-out both;
}
.noVNC_vv_spinner div:nth-child(1) { animation-delay: -0.32s; }
.noVNC_vv_spinner div:nth-child(2) { animation-delay: -0.16s; }
@keyframes vvBounce {
    0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
    40% { transform: scale(1); opacity: 1; }
}
@keyframes vvPulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.02); }
}
#noVNC_container {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
}
#noVNC_container > canvas {
    display: block !important;
}
.visualvibe-sidebar-logo {
    height: 48px !important;
    width: auto !important;
    max-width: 96% !important;
    object-fit: contain !important;
    display: block !important;
    margin: 0 auto !important;
    image-rendering: -webkit-optimize-contrast;
    filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.4));
}
.noVNC_logo {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    text-align: center !important;
}
#noVNC_setting_enable_hidpi_option {
    display: inline-block !important;
}
#noVNC_game_mode_button,
#noVNC_game_mode_container,
.visualvibe-hidden-game-mode,
.noVNC_button_div:has(#noVNC_game_mode_button) {
    display: none !important;
    visibility: hidden !important;
    width: 0 !important;
    height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    pointer-events: none !important;
    overflow: hidden !important;
}
</style>
"""

# FIX C-01: Use asset URL, not Data URI, for the splash screen logo (favicon.svg)
splash_logo_url = "./assets/favicon.svg"
splash_html = (
    '<div id="noVNC_transition">'
    '<div class="visualvibe-connect-logo-container">'
    f'<img class="visualvibe-connect-logo" src="{splash_logo_url}" alt="VisualVibe Electron">'
    '</div>'
    '<div id="noVNC_transition_text">Connecting...</div>'
    '<div><input type="button" id="noVNC_cancel_reconnect_button" value="Cancel" class="noVNC_submit"></div>'
    '<div class="noVNC_vv_spinner"><div></div><div></div><div></div></div>'
    '</div>'
)

# 3. Patch index.html and vnc.html
switch_window_html = (
    '<div id="noVNC_switch_window_button" class="noVNC_button_div visualvibe-control-btn" role="button" tabindex="0" '
    'style="display: flex; align-items: center; padding: 8px 10px; margin: 4px 0 6px 0; '
    'background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 6px; '
    'color: #ffffff; text-decoration: none; cursor: pointer; transition: all 0.2s ease; user-select: none;" '
    'onmouseover="this.style.background=\'rgba(255, 255, 255, 0.18)\'; this.style.borderColor=\'rgba(255, 255, 255, 0.3)\';" '
    'onmouseout="this.style.background=\'rgba(255, 255, 255, 0.08)\'; this.style.borderColor=\'rgba(255, 255, 255, 0.12)\';" '
    'onmousedown="this.style.transform=\'scale(0.97)\';" onmouseup="this.style.transform=\'none\';" '
    'onclick="window.kasmSwitchWindow && window.kasmSwitchWindow();" '
    'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();window.kasmSwitchWindow&&window.kasmSwitchWindow();}" '
    'title="Switch active window (Alt+Tab)">'
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 10px; flex-shrink: 0; color: #38bdf8;"><rect x="2" y="7" width="13" height="13" rx="2"></rect><path d="M5 7V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"></path></svg>'
    '<span style="font-size: 13px; font-weight: 500; letter-spacing: 0.3px; flex-grow: 1;">Switch Window</span>'
    '<span style="font-size: 10px; font-weight: 600; opacity: 0.65; background: rgba(255, 255, 255, 0.12); padding: 2px 6px; border-radius: 4px; font-family: -apple-system, BlinkMacSystemFont, monospace;">Alt+Tab</span>'
    '</div>'
)

open_browser_html = (
    '<div id="noVNC_open_browser_button" class="noVNC_button_div visualvibe-control-btn" role="button" tabindex="0" '
    'style="display: flex; align-items: center; padding: 8px 10px; margin: 4px 0 6px 0; '
    'background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 6px; '
    'color: #ffffff; text-decoration: none; cursor: pointer; transition: all 0.2s ease; user-select: none;" '
    'onmouseover="this.style.background=\'rgba(255, 255, 255, 0.18)\'; this.style.borderColor=\'rgba(255, 255, 255, 0.3)\';" '
    'onmouseout="this.style.background=\'rgba(255, 255, 255, 0.08)\'; this.style.borderColor=\'rgba(255, 255, 255, 0.12)\';" '
    'onmousedown="this.style.transform=\'scale(0.97)\';" onmouseup="this.style.transform=\'none\';" '
    'onclick="window.kasmOpenBrowser && window.kasmOpenBrowser();" '
    'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();window.kasmOpenBrowser&&window.kasmOpenBrowser();}" '
    'title="Open or focus Chromium Browser">'
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 10px; flex-shrink: 0; color: #34d399;"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4"></circle><line x1="21.17" y1="8" x2="12" y2="8"></line><line x1="3.95" y1="6.06" x2="8.54" y2="14"></line><line x1="10.88" y1="21.94" x2="15.46" y2="14"></line></svg>'
    '<span style="font-size: 13px; font-weight: 500; letter-spacing: 0.3px; flex-grow: 1;">Open Browser</span>'
    '<span style="font-size: 10px; font-weight: 600; opacity: 0.65; background: rgba(255, 255, 255, 0.12); padding: 2px 6px; border-radius: 4px; font-family: -apple-system, BlinkMacSystemFont, monospace;">Web</span>'
    '</div>'
)

browser_actions_script = (
    '<script id="noVNC_browser_actions_script">\n'
    '// Permanent title lock to "VisualVibe Electron"\n'
    'try {\n'
    '    document.title = "VisualVibe Electron";\n'
    '    Object.defineProperty(document, "title", {\n'
    '        get: function() { return "VisualVibe Electron"; },\n'
    '        set: function() { /* lock */ },\n'
    '        configurable: true\n'
    '    });\n'
    '} catch(e) {}\n'
    'function ensureVisualVibeConnectLogo() {\n'
    '    try {\n'
    '        var t = document.getElementById("noVNC_transition");\n'
    '        if (!t) return;\n'
    '        var existingImg = t.querySelector(".visualvibe-connect-logo");\n'
    '        if (existingImg) {\n'
    '            if (!existingImg.src.includes("favicon.svg")) {\n'
    '                existingImg.src = "./assets/favicon.svg";\n'
    '            }\n'
    '        } else {\n'
    '            var c = t.querySelector(".visualvibe-connect-logo-container");\n'
    '            if (!c) {\n'
    '                c = document.createElement("div");\n'
    '            c.className = "visualvibe-connect-logo-container";\n'
    '                t.insertBefore(c, t.firstChild);\n'
    '            }\n'
    '            var img = document.createElement("img");\n'
    '            img.className = "visualvibe-connect-logo";\n'
    '            img.src = "./assets/favicon.svg";\n'
    '            img.alt = "VisualVibe Electron";\n'
    '            c.appendChild(img);\n'
    '        }\n'
    '        if (!window.__vvLogoObserver || window.__vvLogoObserved !== t) {\n'
    '            if (window.__vvLogoObserver) { try { window.__vvLogoObserver.disconnect(); } catch(e) {} }\n'
    '            window.__vvLogoObserved = t;\n'
    '            window.__vvLogoObserver = new MutationObserver(function() {\n'
    '                if (!t.querySelector(".visualvibe-connect-logo-container")) {\n'
    '                    ensureVisualVibeConnectLogo();\n'
    '                }\n'
    '            });\n'
    '            window.__vvLogoObserver.observe(t, { childList: true });\n'
    '        }\n'
    '    } catch(e) { console.error("ensureVisualVibeConnectLogo error:", e); }\n'
    '}\n'
    'window.kasmSwitchWindow = function() {\n'
    '    try {\n'
    '        var u = window.UI;\n'
    '        var rfb = u ? (u.rfb || u._rfb) : null;\n'
    '        if (rfb && (u.connected || rfb._rfbConnectionState === "connected")) {\n'
    '            rfb.sendKey(65513, "AltLeft", true);\n'
    '            setTimeout(function() {\n'
    '                rfb.sendKey(65289, "Tab", true);\n'
    '                setTimeout(function() {\n'
    '                    rfb.sendKey(65289, "Tab", false);\n'
    '                    setTimeout(function() {\n'
    '                        rfb.sendKey(65513, "AltLeft", false);\n'
    '                    }, 50);\n'
    '                }, 50);\n'
    '            }, 30);\n'
    '            return;\n'
    '        }\n'
    '        var altBtn = document.getElementById("noVNC_toggle_alt_button");\n'
    '        var tabBtn = document.getElementById("noVNC_send_tab_button");\n'
    '        if (altBtn && tabBtn) {\n'
    '            if (!altBtn.classList.contains("noVNC_selected")) altBtn.click();\n'
    '            setTimeout(function() {\n'
    '                tabBtn.click();\n'
    '                setTimeout(function() {\n'
    '                    if (altBtn.classList.contains("noVNC_selected")) altBtn.click();\n'
    '                }, 120);\n'
    '            }, 30);\n'
    '        }\n'
    '    } catch (e) { console.error("Switch window error:", e); }\n'
    '};\n'
    'window.kasmOpenBrowser = function() {\n'
    '    try {\n'
    '        var u = window.UI;\n'
    '        var rfb = u ? (u.rfb || u._rfb) : null;\n'
    '        var connected = !!(u && (u.connected || (rfb && rfb._rfbConnectionState === "connected")));\n'
    '        console.log("[kasmOpenBrowser] UI=" + !!u + " rfb=" + !!rfb + " connected=" + connected + " state=" + (rfb ? rfb._rfbConnectionState : "n/a"));\n'
    '        if (rfb && connected) {\n'
    '            rfb.sendKey(65507, "ControlLeft", true);\n'
    '            rfb.sendKey(65513, "AltLeft", true);\n'
    '            setTimeout(function() {\n'
    '                rfb.sendKey(119, "KeyW", true);\n'
    '                setTimeout(function() {\n'
    '                    rfb.sendKey(119, "KeyW", false);\n'
    '                    setTimeout(function() {\n'
    '                        rfb.sendKey(65513, "AltLeft", false);\n'
    '                        rfb.sendKey(65507, "ControlLeft", false);\n'
    '                    }, 40);\n'
    '                }, 40);\n'
    '            }, 40);\n'
    '            return;\n'
    '        }\n'
    '        // Fallback: sticky noVNC Ctrl/Alt buttons + synthetic KeyW on keyboard input\n'
    '        var ctrlBtn = document.getElementById("noVNC_toggle_ctrl_button");\n'
    '        var altBtn = document.getElementById("noVNC_toggle_alt_button");\n'
    '        var kbInput = document.getElementById("noVNC_keyboardinput") || document.body;\n'
    '        if (ctrlBtn && altBtn) {\n'
    '            if (!ctrlBtn.classList.contains("noVNC_selected")) ctrlBtn.click();\n'
    '            if (!altBtn.classList.contains("noVNC_selected")) altBtn.click();\n'
    '            setTimeout(function() {\n'
    '                try {\n'
    '                    kbInput.dispatchEvent(new KeyboardEvent("keydown", { key: "w", code: "KeyW", keyCode: 87, which: 87, bubbles: true }));\n'
    '                    kbInput.dispatchEvent(new KeyboardEvent("keyup", { key: "w", code: "KeyW", keyCode: 87, which: 87, bubbles: true }));\n'
    '                } catch(e) { console.error("kasmOpenBrowser fallback key error:", e); }\n'
    '                setTimeout(function() {\n'
    '                    if (ctrlBtn.classList.contains("noVNC_selected")) ctrlBtn.click();\n'
    '                    if (altBtn.classList.contains("noVNC_selected")) altBtn.click();\n'
    '                }, 120);\n'
    '            }, 80);\n'
    '        } else {\n'
    '            console.error("kasmOpenBrowser: noVNC ctrl/alt buttons not found");\n'
    '        }\n'
    '    } catch (e) { console.error("Open browser error:", e); }\n'
    '};\n'
    '// Cloudflare-Resilient profile: 30 FPS, dynamic quality (7-9), lossless text, native resolution\n'
    'try {\n'
    '    localStorage.setItem("video_quality", "3");\n'
    '    localStorage.setItem("framerate", "30");\n'
    '    localStorage.setItem("frame_rate", "30");\n'
    '    localStorage.setItem("dynamic_quality", "true");\n'
    '    localStorage.setItem("dynamic_quality_min", "7");\n'
    '    localStorage.setItem("dynamic_quality_max", "9");\n'
    '    localStorage.setItem("webp_video_quality", "8");\n'
    '    localStorage.setItem("jpeg_video_quality", "8");\n'
    '    localStorage.setItem("treat_lossless", "9");\n'
    '    localStorage.setItem("resize", "remote");\n'
    '    localStorage.setItem("enable_hidpi", "true");\n'
    '    localStorage.setItem("idle_disconnect", "0");\n'
    '    if (!localStorage.getItem("reconnect")) {\n'
    '        localStorage.setItem("reconnect", "true");\n'
    '    }\n'
    '    localStorage.setItem("reconnect_delay", "2000");\n'
    '} catch(e) {}\n'
    'function applyVisualVibeSettings() {\n'
    '    try {\n'
    '        ensureVisualVibeConnectLogo();\n'
    '        var u = window.UI;\n'
    '        var hidpiOpt = document.getElementById("noVNC_setting_enable_hidpi_option");\n'
    '        if (hidpiOpt) {\n'
    '            hidpiOpt.classList.add("show");\n'
    '            hidpiOpt.style.display = "inline-block";\n'
    '        }\n'
    '        var hidpiInput = document.getElementById("noVNC_setting_enable_hidpi");\n'
    '        if (hidpiInput && !hidpiInput.checked) {\n'
    '            hidpiInput.checked = true;\n'
    '            hidpiInput.dispatchEvent(new Event("change", { bubbles: true }));\n'
    '        }\n'
    '        var resizeSelect = document.getElementById("noVNC_setting_resize");\n'
    '        if (resizeSelect && resizeSelect.value !== "remote") {\n'
    '            resizeSelect.value = "remote";\n'
    '            resizeSelect.dispatchEvent(new Event("change", { bubbles: true }));\n'
    '        }\n'
    '        var vqSelect = document.getElementById("noVNC_setting_video_quality");\n'
    '        if (vqSelect) {\n'
    '            var updateVqLabels = function() {\n'
    '                for (var i = 0; i < vqSelect.options.length; i++) {\n'
    '                    var opt = vqSelect.options[i];\n'
    '                    if (String(opt.value) === "3" || opt.label === "High" || opt.label === "Alto" || opt.text === "High" || opt.text === "Alto") {\n'
    '                        if (opt.label !== "VisualVibe" || opt.text !== "VisualVibe") {\n'
    '                            opt.label = "VisualVibe";\n'
    '                            opt.text = "VisualVibe";\n'
    '                            opt.innerText = "VisualVibe";\n'
    '                        }\n'
    '                    }\n'
    '                }\n'
    '            };\n'
    '            updateVqLabels();\n'
    '            if (!vqSelect._vv_observer && typeof MutationObserver !== "undefined") {\n'
    '                vqSelect._vv_observer = new MutationObserver(updateVqLabels);\n'
    '                vqSelect._vv_observer.observe(vqSelect, { childList: true, subtree: true, characterData: true, attributes: true });\n'
    '            }\n'
    '            if (vqSelect.value !== "3") {\n'
    '                vqSelect.value = "3";\n'
    '                vqSelect.dispatchEvent(new Event("change", { bubbles: true }));\n'
    '            }\n'
    '        }\n'
    '        var fpsInput = document.getElementById("noVNC_setting_framerate") || document.getElementById("noVNC_setting_frame_rate");\n'
    '        if (fpsInput && fpsInput.value !== "30") {\n'
    '            fpsInput.value = "30";\n'
    '            fpsInput.dispatchEvent(new Event("change", { bubbles: true }));\n'
    '        }\n'
    '        var dqMinInput = document.getElementById("noVNC_setting_dynamic_quality_min");\n'
    '        if (dqMinInput && dqMinInput.value !== "7") {\n'
    '            dqMinInput.value = "7";\n'
    '            dqMinInput.dispatchEvent(new Event("change", { bubbles: true }));\n'
    '        }\n'
    '        var dqMaxInput = document.getElementById("noVNC_setting_dynamic_quality_max");\n'
    '        if (dqMaxInput && dqMaxInput.value !== "9") {\n'
    '            dqMaxInput.value = "9";\n'
    '            dqMaxInput.dispatchEvent(new Event("change", { bubbles: true }));\n'
    '        }\n'
    '        var losslessInput = document.getElementById("noVNC_setting_treat_lossless");\n'
    '        if (losslessInput && losslessInput.value !== "9") {\n'
    '            losslessInput.value = "9";\n'
    '            losslessInput.dispatchEvent(new Event("change", { bubbles: true }));\n'
    '        }\n'
    '        if (u) {\n'
    '            if (typeof u.forceSetting === "function") {\n'
    '                u.forceSetting("enable_hidpi", true, false);\n'
    '                u.forceSetting("resize", "remote", false);\n'
    '                u.forceSetting("video_quality", 3, false);\n'
    '                u.forceSetting("framerate", 30, false);\n'
    '                u.forceSetting("frame_rate", 30, false);\n'
    '                u.forceSetting("dynamic_quality", true, false);\n'
    '                u.forceSetting("dynamic_quality_min", 7, false);\n'
    '                u.forceSetting("dynamic_quality_max", 9, false);\n'
    '                u.forceSetting("treat_lossless", 9, false);\n'
    '                u.forceSetting("webp_video_quality", 8, false);\n'
    '            }\n'
    '            if (typeof u.enableHiDpi === "function") u.enableHiDpi();\n'
    '            if (typeof u.applyResizeMode === "function") u.applyResizeMode();\n'
    '            if (typeof u.updateQuality === "function") u.updateQuality(30);\n'
    '            if (u.rfb) {\n'
    '                u.rfb.enableHiDpi = true;\n'
    '                u.rfb.resizeSession = true;\n'
    '                u.rfb.scaleViewport = false;\n'
    '                u.rfb.clipViewport = true;\n'
    '                u.rfb.videoQuality = 3;\n'
    '                u.rfb.frameRate = 30;\n'
    '                u.rfb.webpVideoQuality = 8;\n'
    '                u.rfb.dynamicQualityMin = 7;\n'
    '                u.rfb.dynamicQualityMax = 9;\n'
    '                u.rfb.treatLossless = 9;\n'
    '                if (typeof u.rfb.updateConnectionSettings === "function") u.rfb.updateConnectionSettings();\n'
    '            }\n'
    '        }\n'
    '    } catch(e) { console.error("applyVisualVibeSettings error:", e); }\n'
    '}\n'
    'document.addEventListener("DOMContentLoaded", applyVisualVibeSettings);\n'
    'document.addEventListener("DOMContentLoaded", ensureVisualVibeConnectLogo);\n'
    'setTimeout(applyVisualVibeSettings, 100);\n'
    'setTimeout(applyVisualVibeSettings, 500);\n'
    'setTimeout(applyVisualVibeSettings, 1500);\n'
    'setTimeout(applyVisualVibeSettings, 3000);\n'
    'setInterval(function() {\n'
    '    var u = window.UI;\n'
    '    if (u && u.rfb && !u._vv_settings_hooked) {\n'
    '        u._vv_settings_hooked = true;\n'
    '        u.rfb.addEventListener("connect", function() {\n'
    '            setTimeout(applyVisualVibeSettings, 50);\n'
    '            setTimeout(applyVisualVibeSettings, 500);\n'
    '        });\n'
    '        applyVisualVibeSettings();\n'
    '    }\n'
    '}, 500);\n'
    '// Heartbeat keep-alive every 10 seconds to prevent reverse proxy (Nginx, Traefik, Cloudflare) idle timeouts\n'
    'setInterval(function() {\n'
    '    try {\n'
    '        var u = window.UI;\n'
    '        var rfb = u ? (u.rfb || u._rfb) : null;\n'
    '        if (rfb && (u.connected || rfb._rfbConnectionState === "connected")) {\n'
    '            if (typeof rfb.sendKeepAlive === "function") {\n'
    '                rfb.sendKeepAlive();\n'
    '            }\n'
    '        }\n'
    '    } catch(e) {}\n'
    '}, 10000);\n'
    '// Hide Game Cursor Mode / Game pointer mode from sidebar\n'
    'function hideGameCursorMode() {\n'
    '    try {\n'
    '        var btn = document.getElementById("noVNC_game_mode_button");\n'
    '        if (btn) {\n'
    '            btn.style.setProperty("display", "none", "important");\n'
    '            btn.style.setProperty("visibility", "hidden", "important");\n'
    '            var parent = btn.closest ? btn.closest(".noVNC_button_div") : btn.parentElement;\n'
    '            if (parent) {\n'
    '                parent.style.setProperty("display", "none", "important");\n'
    '                parent.style.setProperty("visibility", "hidden", "important");\n'
    '                parent.classList.add("noVNC_hidden");\n'
    '            }\n'
    '        }\n'
    '    } catch(e) {}\n'
    '}\n'
    'hideGameCursorMode();\n'
    'window.addEventListener("DOMContentLoaded", hideGameCursorMode);\n'
    'window.addEventListener("load", hideGameCursorMode);\n'
    '(function hookShowControlInput() {\n'
    '    function tryHook() {\n'
    '        if (window.UI && typeof window.UI.showControlInput === "function" && !window.UI._vvHookedGameMode) {\n'
    '            var origShow = window.UI.showControlInput;\n'
    '            window.UI.showControlInput = function(name) {\n'
    '                if (name === "noVNC_game_mode_button") return;\n'
    '                return origShow.apply(this, arguments);\n'
    '            };\n'
    '            window.UI._vvHookedGameMode = true;\n'
    '        }\n'
    '    }\n'
    '    tryHook();\n'
    '    setInterval(tryHook, 250);\n'
    '})();\n'
    '</script>\n'
)

sidebar_brand_content = (
    '<img src="./assets/visualvibe_horizontal.png" alt="VisualVibe" class="visualvibe-sidebar-logo" />'
)

replacement_logo_html = (
    '<h1 class="noVNC_logo" style="background: rgba(255, 255, 255, 0.08); '
    'border-radius: 8px; padding: 6px 8px; margin: 4px 0 6px 0; display: flex; '
    'align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.3); '
    'border: 1px solid rgba(255, 255, 255, 0.12);">'
    f'{sidebar_brand_content}'
    '</h1>\n'
    f'{switch_window_html}\n'
    f'{open_browser_html}\n'
    '<a href="/filebrowser/" target="_blank" rel="noopener noreferrer" id="noVNC_filebrowser_link" '
    'class="noVNC_button_div" style="display: flex; align-items: center; padding: 8px 10px; margin: 4px 0 10px 0; '
    'background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 6px; '
    'color: #ffffff; text-decoration: none; cursor: pointer; transition: all 0.2s ease;" '
    'onmouseover="this.style.background=\'rgba(255, 255, 255, 0.18)\'; this.style.borderColor=\'rgba(255, 255, 255, 0.3)\';" '
    'onmouseout="this.style.background=\'rgba(255, 255, 255, 0.08)\'; this.style.borderColor=\'rgba(255, 255, 255, 0.12)\';" '
    'onclick="event.preventDefault(); var u = \'/filebrowser/\'; if(window.location.port===\'8080\'){ u = window.location.protocol+\'//\'+window.location.hostname+\':8081/filebrowser/\'; } window.open(u, \'_blank\', \'noopener,noreferrer\');" '
    'title="Open VisualVibe Filebrowser in a new window">'
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 10px; flex-shrink: 0; color: #60a5fa;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>'
    '<span style="font-size: 13px; font-weight: 500; letter-spacing: 0.3px; flex-grow: 1;">FileBrowser</span>'
    '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6; flex-shrink: 0;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>'
    '</a>'
)

title_script = (
    '<title>VisualVibe Electron</title>'
    '<link rel="icon" type="image/x-icon" href="./assets/favicon.ico">'
    '<link rel="icon" type="image/png" sizes="32x32" href="./assets/favicon_32x32.png">'
    '<link rel="icon" type="image/png" sizes="16x16" href="./assets/favicon_16x16.png">'
    '<link rel="apple-touch-icon" sizes="180x180" href="./assets/favicon_180x180.png">'
    '<script>document.title="VisualVibe Electron";'
    'try{Object.defineProperty(document,"title",{get:function(){return"VisualVibe Electron"},set:function(){},configurable:true});}catch(e){}'
    '</script>'
)

for filename in ["index.html", "vnc.html"]:
    filepath = os.path.join(WWW_DIR, filename)
    if not os.path.isfile(filepath):
        continue

    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read()

    # 3a. Title and favicons
    if "<title>KasmVNC</title>" in html:
        html = tracker.tracked_replace(
            html,
            "<title>KasmVNC</title>",
            title_script,
            name=f"{filename}:set_title_and_favicons",
            critical=True
        )
    elif "<title>VisualVibe Electron</title>" in html and "visualvibe-splash-style" not in html:
        pass

    # 3b. Sidebar logo, Switch Window button, Open Browser button, and FileBrowser link
    if 'id="noVNC_open_browser_button"' not in html:
        if 'id="noVNC_switch_window_button"' in html:
            html = tracker.tracked_sub(
                r'(<div\s+[^>]*id="noVNC_switch_window_button"[^>]*>.*?</div>\s*)',
                f'\\1{open_browser_html}\n',
                html,
                name=f"{filename}:inject_open_browser_after_switch_window",
                critical=True,
                flags=re.DOTALL
            )
        elif 'id="noVNC_filebrowser_link"' in html:
            html = tracker.tracked_sub(
                r'(<a\s+[^>]*id="noVNC_filebrowser_link")',
                f'{switch_window_html}\n{open_browser_html}\n\\1',
                html,
                name=f"{filename}:inject_buttons_before_filebrowser",
                critical=True
            )
        elif '<h1 class=noVNC_logo>' in html:
            html = tracker.tracked_sub(
                r'<h1 class=noVNC_logo>.*?</h1>',
                replacement_logo_html,
                html,
                name=f"{filename}:inject_sidebar_links_h1_unquoted",
                critical=True,
                count=1,
                flags=re.DOTALL
            )
        elif '<h1 class="noVNC_logo">' in html:
            html = tracker.tracked_sub(
                r'<h1 class="noVNC_logo">.*?</h1>',
                replacement_logo_html,
                html,
                name=f"{filename}:inject_sidebar_links_h1_quoted",
                critical=True,
                count=1,
                flags=re.DOTALL
            )
        elif '<div class="noVNC_logo"' in html:
            html = tracker.tracked_sub(
                r'<div class="noVNC_logo".*?</div>',
                replacement_logo_html,
                html,
                name=f"{filename}:inject_sidebar_links_div",
                critical=True,
                count=1,
                flags=re.DOTALL
            )
        else:
            tracker.results.append(PatchResult(f"{filename}:inject_sidebar_links", critical=True))

    # Ensure header in sidebar uses visualvibe-sidebar-logo
    if 'visualvibe-sidebar-logo' not in html:
        if '<h1 class="noVNC_logo"' in html or '<h1 class=noVNC_logo' in html:
            html = tracker.tracked_sub(
                r'<h1\s+class=["\']?noVNC_logo["\']?[^>]*>.*?</h1>',
                f'<h1 class="noVNC_logo" style="background: rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 6px 8px; margin: 4px 0 6px 0; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 1px solid rgba(255, 255, 255, 0.12);">{sidebar_brand_content}</h1>',
                html,
                name=f"{filename}:ensure_visualvibe_sidebar_logo_h1",
                critical=True,
                count=1,
                flags=re.DOTALL
            )
        elif '<div class="noVNC_logo"' in html:
            html = tracker.tracked_sub(
                r'<div\s+class=["\']noVNC_logo["\'][^>]*>.*?</div>',
                f'<h1 class="noVNC_logo" style="background: rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 6px 8px; margin: 4px 0 6px 0; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 1px solid rgba(255, 255, 255, 0.12);">{sidebar_brand_content}</h1>',
                html,
                name=f"{filename}:ensure_visualvibe_sidebar_logo_div",
                critical=True,
                count=1,
                flags=re.DOTALL
            )
        else:
            tracker.results.append(PatchResult(f"{filename}:ensure_visualvibe_sidebar_logo", critical=True))

    # 3b-2. Browser actions script
    if 'id="noVNC_browser_actions_script"' in html:
        html = tracker.tracked_sub(
            r'<script\s+id="noVNC_browser_actions_script">.*?</script>\n?',
            browser_actions_script,
            html,
            name=f"{filename}:update_browser_actions_script",
            critical=True,
            flags=re.DOTALL
        )
    elif 'id="noVNC_switch_window_script"' in html:
        html = tracker.tracked_sub(
            r'<script\s+id="noVNC_switch_window_script">.*?</script>\n?',
            browser_actions_script,
            html,
            name=f"{filename}:replace_switch_window_with_browser_actions_script",
            critical=True,
            flags=re.DOTALL
        )
    elif '</body>' in html:
        html = tracker.tracked_replace(
            html,
            '</body>',
            f'{browser_actions_script}\n</body>',
            name=f"{filename}:inject_browser_actions_script_body",
            critical=True
        )
    elif '</html>' in html:
        html = tracker.tracked_replace(
            html,
            '</html>',
            f'{browser_actions_script}\n</html>',
            name=f"{filename}:inject_browser_actions_script_html",
            critical=True
        )
    else:
        html = html + f'\n{browser_actions_script}\n'

    # 3b-3. Hide Game Cursor Mode / Game pointer mode from sidebar
    if 'id="noVNC_game_mode_container"' not in html and 'visualvibe-hidden-game-mode' not in html:
        html = tracker.tracked_sub(
            r'<div\s+([^>]*class=["\']?[^>]*noVNC_button_div[^>]*["\']?[^>]*)>(\s*<input[^>]*id=["\']?noVNC_game_mode_button["\']?[^>]*>.*?</div>)',
            r'<div id="noVNC_game_mode_container" \1 class="visualvibe-hidden-game-mode" style="display: none !important; visibility: hidden !important; pointer-events: none !important;">\2',
            html,
            name=f"{filename}:hide_game_cursor_mode_container",
            critical=False,
            flags=re.DOTALL
        )

    # 3c. Splash styles injection (idempotent: replace any legacy splash style block)
    if re.search(r'<style\s+id=["\']?visualvibe-splash-style["\']?>.*?</style>', html, flags=re.DOTALL):
        html = tracker.tracked_sub(
            r'<style\s+id=["\']?visualvibe-splash-style["\']?>.*?</style>',
            splash_css,
            html,
            name=f"{filename}:update_visualvibe_splash_style",
            critical=True,
            count=1,
            flags=re.DOTALL
        )
    elif "</head>" in html:
        html = tracker.tracked_replace(
            html,
            "</head>",
            f"{splash_css}\n</head>",
            name=f"{filename}:inject_splash_css_head",
            critical=True
        )
    elif "</title>" in html:
        html = tracker.tracked_replace(
            html,
            "</title>",
            f"</title>\n{splash_css}",
            name=f"{filename}:inject_splash_css_after_title",
            critical=True
        )
    else:
        html = f"{splash_css}\n" + html

    # 3d. Replace transition / connecting splash container in <body>
    # Support both quoted attributes (id="noVNC_transition") and unquoted (id=noVNC_transition)
    if 'class="visualvibe-connect-logo-container"' not in html:
        transition_pattern = r'<div\s+id=["\']?noVNC_transition["\']?>.*?</div>\s*</div>(?=\s*<div\s+id=["\']?noVNC_container)'
        if re.search(transition_pattern, html, flags=re.DOTALL):
            html = tracker.tracked_sub(
                transition_pattern,
                splash_html,
                html,
                name=f"{filename}:replace_transition_pattern",
                critical=True,
                count=1,
                flags=re.DOTALL
            )
        else:
            # Fallback search for transition block
            transition_pattern_simple = r'<div\s+id=["\']?noVNC_transition["\']?>.*?<div\s+class=["\']?noVNC_spinner["\']?></div></div>'
            if re.search(transition_pattern_simple, html, flags=re.DOTALL):
                html = tracker.tracked_sub(
                    transition_pattern_simple,
                    splash_html,
                    html,
                    name=f"{filename}:replace_transition_simple",
                    critical=True,
                    count=1,
                    flags=re.DOTALL
                )

    # 3e. Ensure Native Resolution (enable_hidpi) checkbox is checked and option is visible
    html = tracker.tracked_sub(
        r'<label\s+id=["\']?noVNC_setting_enable_hidpi_option["\']?[^>]*>\s*<input([^>]*)id=["\']?noVNC_setting_enable_hidpi["\']?([^>]*)>\s*Native Resolution\s*</label>',
        r'<label id="noVNC_setting_enable_hidpi_option" class="button show" style="display:inline-block !important;"><input\1id="noVNC_setting_enable_hidpi"\2 checked> Native Resolution</label>',
        html,
        name=f"{filename}:enable_hidpi_option_checked",
        critical=False
    )
    # Ensure Remote Resizing (Native Resolution) is pre-selected in Scaling Mode select
    html = tracker.tracked_sub(
        r'<option\s+value=["\']?remote["\']?>Remote Resizing</option>',
        r'<option value="remote" selected>Remote Resizing</option>',
        html,
        name=f"{filename}:preselect_remote_resizing_quoted",
        critical=False
    )
    html = tracker.tracked_sub(
        r'<option\s+value=remote>Remote Resizing',
        r'<option value=remote selected>Remote Resizing',
        html,
        name=f"{filename}:preselect_remote_resizing_unquoted",
        critical=False
    )

    # 3f. Cloudflare-Resilient profile: 30 FPS DOM input and treat_lossless display
    html = tracker.tracked_sub(
        r'(<input[^>]*id=["\']?noVNC_setting_framerate["\']?[^>]*value=)["\']?\d+["\']?',
        r'\g<1>"30"',
        html,
        name=f"{filename}:framerate_30",
        critical=True
    )
    html = tracker.tracked_sub(
        r'(<output[^>]*id=["\']?noVNC_setting_treat_lossless_output["\']?[^>]*>)\d+(</output>)',
        r'\g<1>9\g<2>',
        html,
        name=f"{filename}:treat_lossless_9",
        critical=True
    )

    # 3g. Rename preset "High" / "Alto" option in HTML if present
    html = tracker.tracked_sub(
        r'(<option[^>]*value=["\']?3["\']?[^>]*label=["\']?)(?:High|Alto)(["\']?)',
        r'\g<1>VisualVibe\g<2>',
        html,
        name=f"{filename}:rename_high_option_label",
        critical=False
    )
    html = tracker.tracked_sub(
        r'(<option[^>]*value=["\']?3["\']?[^>]*>)\s*(?:High|Alto)\s*(</option>)',
        r'\g<1>VisualVibe\g<2>',
        html,
        name=f"{filename}:rename_high_option_text",
        critical=False
    )

    # 3h. Cache-busting on stylesheet and script links to prevent stale browser caches
    html = tracker.tracked_sub(
        r'href="(\./assets/ui-[^"]+\.css)(?:\?[^"]*)?"',
        r'href="\1?v=vvelectron_v9"',
        html,
        name=f"{filename}:cache_bust_css",
        critical=False
    )
    html = tracker.tracked_sub(
        r'src="(\./assets/ui-[^"]+\.js)(?:\?[^"]*)?"',
        r'src="\1?v=vvelectron_v9"',
        html,
        name=f"{filename}:cache_bust_js",
        critical=False
    )

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"[Brand] Successfully patched {filename} ({len(html)} bytes)")

# 4. Patch KasmVNC CSS stylesheets (remove legacy KasmVNC logo background & apply VisualVibe theme)
target_css_files = set()
for pattern in [
    os.path.join(WWW_DIR, "dist", "*.css"),
    os.path.join(WWW_DIR, "app", "styles", "*.css"),
    os.path.join(assets_dir, "*.css"),
]:
    target_css_files.update(glob.glob(pattern))

for css_file in sorted(target_css_files):
    with open(css_file, "r", encoding="utf-8") as f:
        css = f.read()

    css_name = os.path.basename(css_file)
    # Safely replace the KasmVNC SVG background on #noVNC_transition if present.
    if re.search(r'background\s*:\s*#fff\s+url\("data:image/svg\+xml.*?"\)\s*no-repeat fixed center;', css):
        css_patched = tracker.tracked_sub(
            r'background\s*:\s*#fff\s+url\("data:image/svg\+xml.*?"\)\s*no-repeat fixed center;',
            'background:#0e0e16;',
            css,
            name=f"{css_name}:replace_splash_svg_bg",
            critical=False
        )
    else:
        css_patched = css
    # Replace URL references to SVG/images inside #noVNC_transition background
    if re.search(r'background\s*:\s*(?:white|#fff)\s+url\([^\)]+\)\s*no-repeat fixed (?:center|50%);?', css_patched):
        css_patched = tracker.tracked_sub(
            r'background\s*:\s*(?:white|#fff)\s+url\([^\)]+\)\s*no-repeat fixed (?:center|50%);?',
            'background:#0e0e16 !important;',
            css_patched,
            name=f"{css_name}:replace_splash_white_bg",
            critical=False
        )

    # Append override rules at end of file to guarantee correct behavior regardless of minification:
    # 1. Override splash screen background to VisualVibe dark theme matching favicon.svg
    # 2. Ensure #noVNC_displays is strictly hidden unless it has the .noVNC_open class
    override_rules = (
        '\n/* VisualVibe Electron: UI layout and theme overrides */\n'
        '#noVNC_transition{background:#0e0e16 !important;background-color:#0e0e16 !important;background-image:none !important;}\n'
        '#noVNC_transition_content{background-color:#0e0e16 !important;}\n'
        '.visualvibe-connect-logo-container{background-color:#0e0e16 !important;border:none !important;outline:none !important;box-shadow:none !important;}\n'
        '.visualvibe-connect-logo{width:140px !important;height:140px !important;max-width:160px !important;max-height:160px !important;margin:0 auto 20px auto !important;display:block !important;object-fit:contain !important;filter:drop-shadow(0 4px 16px rgba(0, 0, 0, 0.4)) !important;border:none !important;outline:none !important;box-shadow:none !important;}\n'
        '#noVNC_displays:not(.noVNC_open){display:none !important;visibility:hidden !important;}\n'
        '#noVNC_displays.noVNC_open{display:flex !important;visibility:visible !important;z-index:1000 !important;}\n'
        '#noVNC_control_bar .noVNC_logo{display:flex !important;align-items:center !important;justify-content:center !important;padding:6px 8px !important;margin:4px 0 6px 0 !important;}\n'
        '#noVNC_control_bar .noVNC_logo img{width:auto !important;max-width:98% !important;height:38px !important;object-fit:contain !important;}\n'
        '.visualvibe-control-btn{cursor:pointer !important;user-select:none !important;transition:all 0.2s ease !important;}\n'
        '#noVNC_game_mode_button,#noVNC_game_mode_container,.visualvibe-hidden-game-mode,.noVNC_button_div:has(#noVNC_game_mode_button){display:none !important;visibility:hidden !important;width:0 !important;height:0 !important;margin:0 !important;padding:0 !important;border:none !important;pointer-events:none !important;overflow:hidden !important;}\n'
    )
    if '/* VisualVibe Electron: UI layout and theme overrides */' in css_patched:
        css_patched = re.sub(
            r'/\*\s*VisualVibe Electron:\s*UI layout and theme overrides\s*\*/.*',
            override_rules.strip(),
            css_patched,
            flags=re.DOTALL
        )
    else:
        css_patched += override_rules

    if css_patched != css:
        with open(css_file, "w", encoding="utf-8") as f:
            f.write(css_patched)
        print(f"[Brand] Successfully patched KasmVNC CSS background in {os.path.basename(css_file)}")

# 5. Patch KasmVNC JS files (title strings, expose window.UI, reconnect & idle settings)
target_js_files = set()
for pattern in [
    os.path.join(WWW_DIR, "dist", "*.bundle.js"),
    os.path.join(WWW_DIR, "dist", "*.js"),
    os.path.join(WWW_DIR, "app", "*.js"),
    os.path.join(assets_dir, "*.js"),
]:
    target_js_files.update(glob.glob(pattern))

for js_file in sorted(target_js_files):
    js_name = os.path.basename(js_file)
    with open(js_file, "r", encoding="utf-8") as f:
        js = f.read()

    modified = False

    # A. Expose window.UI for kasmSwitchWindow and kasmOpenBrowser to work
    if "window.UI=" not in js and "window.UI =" not in js:
        if re.search(r'\b(var|const|let)\s+UI\s*=\s*\{', js):
            js = tracker.tracked_sub(
                r'\b(var|const|let)\s+UI\s*=\s*\{',
                r'\1 UI = window.UI = {',
                js,
                name=f"{js_name}:expose_window_ui_obj",
                critical=False,
                count=1
            )
            modified = True
        if "UI.prime();" in js:
            js = tracker.tracked_replace(
                js,
                "UI.prime();",
                "window.UI = UI; UI.prime();",
                name=f"{js_name}:expose_window_ui_prime",
                critical=False
            )
            modified = True
        elif re.search(r'\w+\.prime\(\)', js):
            js = tracker.tracked_sub(
                r'(\w+)\.prime\(\)',
                r'(window.UI=\1,\1.prime())',
                js,
                name=f"{js_name}:expose_window_ui_prime_regex",
                critical=False,
                count=1
            )
            modified = True

    # B. Match any variable holding the "KasmVNC" string constant and replace with "VisualVibe Electron"
    title_var_match = re.search(r'(?:const|let|var)\s+(\w+)\s*=\s*"KasmVNC"', js)
    if title_var_match:
        var_name = title_var_match.group(1)
        js = tracker.tracked_sub(
            r'\b(const|let|var)\s+' + re.escape(var_name) + r'\s*=\s*"KasmVNC"',
            r'\1 ' + var_name + r'="VisualVibe Electron"',
            js,
            name=f"{js_name}:title_var_kasmvnc",
            critical=False,
            count=1
        )
        modified = True

    if 'PAGE_TITLE = "KasmVNC"' in js:
        js = tracker.tracked_replace(
            js,
            'PAGE_TITLE = "KasmVNC"',
            'PAGE_TITLE = "VisualVibe Electron"',
            name=f"{js_name}:page_title_spaced",
            critical=False
        )
        modified = True
    if 'PAGE_TITLE="KasmVNC"' in js:
        js = tracker.tracked_replace(
            js,
            'PAGE_TITLE="KasmVNC"',
            'PAGE_TITLE="VisualVibe Electron"',
            name=f"{js_name}:page_title_nospace",
            critical=False
        )
        modified = True

    # Force desktop name update and document title to strictly "VisualVibe Electron" without suffix
    title_patterns = [
        r'document\.title\s*=\s*e\.detail\.name\s*\+\s*["\']\s*-\s*["\']\s*\+\s*PAGE_TITLE;',
        r'document\.title\s*=\s*e\.detail\.name\s*\+\s*["\']\s*-\s*["\']\s*\+\s*i;',
        r'document\.title\s*=\s*e\.detail\.name\s*\+\s*["\']\s*-\s*KasmVNC["\'];',
        r'document\.title\s*=\s*PAGE_TITLE;',
        r'document\.title\s*=\s*i;',
    ]
    for idx, tp in enumerate(title_patterns):
        if re.search(tp, js):
            js = tracker.tracked_sub(
                tp,
                'document.title = "VisualVibe Electron";',
                js,
                name=f"{js_name}:doc_title_pattern_{idx}",
                critical=False
            )
            modified = True

    # C. Reconnect settings & Native Resolution default
    if "UI.initSetting('resize', 'off');" in js:
        js = tracker.tracked_replace(
            js,
            "UI.initSetting('resize', 'off');",
            "UI.initSetting('resize', 'remote');",
            name=f"{js_name}:initSetting_resize_off_to_remote",
            critical=False
        )
        modified = True
    if 'o.initSetting("resize","off")' in js:
        js = tracker.tracked_replace(
            js,
            'o.initSetting("resize","off")',
            'o.initSetting("resize","remote")',
            name=f"{js_name}:initSetting_resize_off_to_remote_min",
            critical=False
        )
        modified = True

    # D. Disable showing Game Pointer Mode button in sidebar
    if 'showControlInput("noVNC_game_mode_button")' in js:
        js = tracker.tracked_replace(
            js,
            'showControlInput("noVNC_game_mode_button")',
            'hideControlInput("noVNC_game_mode_button")',
            name=f"{js_name}:hide_game_mode_button_dquote",
            critical=False
        )
        modified = True
    if "showControlInput('noVNC_game_mode_button')" in js:
        js = tracker.tracked_replace(
            js,
            "showControlInput('noVNC_game_mode_button')",
            "hideControlInput('noVNC_game_mode_button')",
            name=f"{js_name}:hide_game_mode_button_squote",
            critical=False
        )
        modified = True

    # Native Resolution (enable_hidpi) default true
    if "UI.initSetting('enable_hidpi', false);" in js:
        js = tracker.tracked_replace(
            js,
            "UI.initSetting('enable_hidpi', false);",
            "UI.initSetting('enable_hidpi', true);",
            name=f"{js_name}:initSetting_enable_hidpi",
            critical=False
        )
        modified = True
    if 'o.initSetting("enable_hidpi",!1)' in js:
        js = tracker.tracked_replace(
            js,
            'o.initSetting("enable_hidpi",!1)',
            'o.initSetting("enable_hidpi",!0)',
            name=f"{js_name}:initSetting_enable_hidpi_min",
            critical=False
        )
        modified = True

    # Video Quality High (3) default & rename preset label to "VisualVibe"
    if "UI.initSetting('video_quality', 2);" in js:
        js = tracker.tracked_replace(
            js,
            "UI.initSetting('video_quality', 2);",
            "UI.initSetting('video_quality', 3);",
            name=f"{js_name}:initSetting_video_quality",
            critical=False
        )
        modified = True
    if 'o.initSetting("video_quality",2)' in js:
        js = tracker.tracked_replace(
            js,
            'o.initSetting("video_quality",2)',
            'o.initSetting("video_quality",3)',
            name=f"{js_name}:initSetting_video_quality_min",
            critical=False
        )
        modified = True
    for idx, high_pattern in enumerate([
        'label: "High"',
        'label:"High"',
        "label: 'High'",
        "label:'High'",
        'label: "Alto"',
        'label:"Alto"',
        "label: 'Alto'",
        "label:'Alto'",
    ]):
        if high_pattern in js:
            js = tracker.tracked_replace(
                js,
                high_pattern,
                'label: "VisualVibe"',
                name=f"{js_name}:rename_preset_label_{idx}",
                critical=False
            )
            modified = True

    # Framerate 30 default (Cloudflare-Resilient profile)
    if "UI.initSetting('framerate', 60);" in js:
        js = tracker.tracked_replace(
            js,
            "UI.initSetting('framerate', 60);",
            "UI.initSetting('framerate', 30);",
            name=f"{js_name}:initSetting_framerate",
            critical=False
        )
        modified = True
    if 'o.initSetting("framerate",60)' in js:
        js = tracker.tracked_replace(
            js,
            'o.initSetting("framerate",60)',
            'o.initSetting("framerate",30)',
            name=f"{js_name}:initSetting_framerate_min",
            critical=False
        )
        modified = True
    if "UI.updateSetting('framerate', 60);" in js:
        js = tracker.tracked_replace(
            js,
            "UI.updateSetting('framerate', 60);",
            "UI.updateSetting('framerate', 30);",
            name=f"{js_name}:updateSetting_framerate",
            critical=False
        )
        modified = True
    # Ensure High preset (case 3) uses 30 FPS instead of 60 FPS
    if "fps = fps && Number.isFinite(fps) ? fps : 60;" in js:
        js = tracker.tracked_replace(
            js,
            "fps = fps && Number.isFinite(fps) ? fps : 60;",
            "fps = fps && Number.isFinite(fps) ? fps : 30;",
            name=f"{js_name}:preset_fps_30",
            critical=False
        )
        modified = True
    if "fps = (fps && Number.isFinite(fps)) ? fps : 60;" in js:
        js = tracker.tracked_replace(
            js,
            "fps = (fps && Number.isFinite(fps)) ? fps : 60;",
            "fps = (fps && Number.isFinite(fps)) ? fps : 30;",
            name=f"{js_name}:preset_fps_30_parens",
            critical=False
        )
        modified = True

    # High WebP quality (8) and Lossless threshold (9) default
    if "UI.initSetting('webp_video_quality', 5);" in js:
        js = tracker.tracked_replace(
            js,
            "UI.initSetting('webp_video_quality', 5);",
            "UI.initSetting('webp_video_quality', 8);",
            name=f"{js_name}:initSetting_webp_video_quality",
            critical=False
        )
        modified = True
    if 'o.initSetting("webp_video_quality",5)' in js:
        js = tracker.tracked_replace(
            js,
            'o.initSetting("webp_video_quality",5)',
            'o.initSetting("webp_video_quality",8)',
            name=f"{js_name}:initSetting_webp_video_quality_min",
            critical=False
        )
        modified = True

    # Treat lossless threshold to 9 (lossless rendering for text blocks)
    for idx, old_lossless in enumerate(["UI.initSetting('treat_lossless', 7);", "UI.initSetting('treat_lossless', 8);"]):
        if old_lossless in js:
            js = tracker.tracked_replace(
                js,
                old_lossless,
                "UI.initSetting('treat_lossless', 9);",
                name=f"{js_name}:initSetting_treat_lossless_{idx}",
                critical=False
            )
            modified = True
    for idx, old_lossless_min in enumerate(['o.initSetting("treat_lossless",7)', 'o.initSetting("treat_lossless",8)']):
        if old_lossless_min in js:
            js = tracker.tracked_replace(
                js,
                old_lossless_min,
                'o.initSetting("treat_lossless",9)',
                name=f"{js_name}:initSetting_treat_lossless_min_{idx}",
                critical=False
            )
            modified = True
    for idx, old_update_lossless in enumerate(["UI.updateSetting('treat_lossless', 7);", "UI.updateSetting('treat_lossless', 8);"]):
        if old_update_lossless in js:
            js = tracker.tracked_replace(
                js,
                old_update_lossless,
                "UI.updateSetting('treat_lossless', 9);",
                name=f"{js_name}:updateSetting_treat_lossless_{idx}",
                critical=False
            )
            modified = True
    if "UI.forceSetting('treat_lossless', 8);" in js:
        js = tracker.tracked_replace(
            js,
            "UI.forceSetting('treat_lossless', 8);",
            "UI.forceSetting('treat_lossless', 9);",
            name=f"{js_name}:forceSetting_treat_lossless_8",
            critical=False
        )
        modified = True
    if "UI.forceSetting('treat_lossless', 7);" in js:
        js = tracker.tracked_replace(
            js,
            "UI.forceSetting('treat_lossless', 7);",
            "UI.forceSetting('treat_lossless', 9);",
            name=f"{js_name}:forceSetting_treat_lossless_7",
            critical=False
        )
        modified = True
    for idx, rfb_lossless in enumerate(["this._treatLossless = 7;", "this._treatLossless = 8;"]):
        if rfb_lossless in js:
            js = tracker.tracked_replace(
                js,
                rfb_lossless,
                "this._treatLossless = 9;",
                name=f"{js_name}:rfb_lossless_{idx}",
                critical=False
            )
            modified = True
    for idx, rfb_lossless_min in enumerate(["_this._treatLossless = 7;", "_this._treatLossless = 8;"]):
        if rfb_lossless_min in js:
            js = tracker.tracked_replace(
                js,
                rfb_lossless_min,
                "_this._treatLossless = 9;",
                name=f"{js_name}:this_lossless_{idx}",
                critical=False
            )
            modified = True

    # Dynamic quality min (7) default
    if "UI.initSetting('dynamic_quality_min', 3);" in js:
        js = tracker.tracked_replace(
            js,
            "UI.initSetting('dynamic_quality_min', 3);",
            "UI.initSetting('dynamic_quality_min', 7);",
            name=f"{js_name}:initSetting_dynamic_quality_min",
            critical=False
        )
        modified = True
    if 'o.initSetting("dynamic_quality_min",3)' in js:
        js = tracker.tracked_replace(
            js,
            'o.initSetting("dynamic_quality_min",3)',
            'o.initSetting("dynamic_quality_min",7)',
            name=f"{js_name}:initSetting_dynamic_quality_min_min",
            critical=False
        )
        modified = True
    if "UI.updateSetting('dynamic_quality_min', 3);" in js:
        js = tracker.tracked_replace(
            js,
            "UI.updateSetting('dynamic_quality_min', 3);",
            "UI.updateSetting('dynamic_quality_min', 7);",
            name=f"{js_name}:updateSetting_dynamic_quality_min",
            critical=False
        )
        modified = True
    for idx, rfb_dq in enumerate(["this._dynamicQualityMin = 3;", "this._dynamicQualityMin = 4;"]):
        if rfb_dq in js:
            js = tracker.tracked_replace(
                js,
                rfb_dq,
                "this._dynamicQualityMin = 7;",
                name=f"{js_name}:rfb_dynamicQualityMin_{idx}",
                critical=False
            )
            modified = True
    for idx, rfb_dq_min in enumerate(["_this._dynamicQualityMin = 3;", "_this._dynamicQualityMin = 4;"]):
        if rfb_dq_min in js:
            js = tracker.tracked_replace(
                js,
                rfb_dq_min,
                "_this._dynamicQualityMin = 7;",
                name=f"{js_name}:this_dynamicQualityMin_{idx}",
                critical=False
            )
            modified = True

    if "UI.initSetting('reconnect', false);" in js:
        js = tracker.tracked_replace(
            js,
            "UI.initSetting('reconnect', false);",
            "UI.initSetting('reconnect', true);",
            name=f"{js_name}:initSetting_reconnect",
            critical=False
        )
        js = tracker.tracked_replace(
            js,
            "UI.initSetting('reconnect_delay', 5000);",
            "UI.initSetting('reconnect_delay', 2000);",
            name=f"{js_name}:initSetting_reconnect_delay",
            critical=False
        )
        modified = True
    elif 'o.initSetting("reconnect",!1)' in js:
        js = tracker.tracked_replace(
            js,
            'o.initSetting("reconnect",!1)',
            'o.initSetting("reconnect",!0)',
            name=f"{js_name}:initSetting_reconnect_min",
            critical=False
        )
        js = tracker.tracked_replace(
            js,
            'o.initSetting("reconnect_delay",5e3)',
            'o.initSetting("reconnect_delay",2e3)',
            name=f"{js_name}:initSetting_reconnect_delay_min",
            critical=False
        )
        modified = True

    # D. Disable idle disconnect
    if "UI.initSetting('idle_disconnect', 20);" in js:
        js = tracker.tracked_replace(
            js,
            "UI.initSetting('idle_disconnect', 20);",
            "UI.initSetting('idle_disconnect', 0);",
            name=f"{js_name}:initSetting_idle_disconnect",
            critical=False
        )
        modified = True
    elif 'o.initSetting("idle_disconnect",20)' in js:
        js = tracker.tracked_replace(
            js,
            'o.initSetting("idle_disconnect",20)',
            'o.initSetting("idle_disconnect",0)',
            name=f"{js_name}:initSetting_idle_disconnect_min",
            critical=False
        )
        modified = True

    if 'c>l?(et("Idle Disconnect reached' in js:
        js = tracker.tracked_replace(
            js,
            'c>l?(et("Idle Disconnect reached',
            '!1&&c>l?(et("Idle Disconnect reached',
            name=f"{js_name}:idle_disconnect_guard",
            critical=False
        )
        js = tracker.tracked_replace(
            js,
            'o.initSetting("idle_disconnect",20)',
            'o.initSetting("idle_disconnect",0)',
            name=f"{js_name}:initSetting_idle_disconnect_bundled",
            critical=False
        )
        modified = True

    if '12e5' in js:
        js = tracker.tracked_sub(
            r'\b12e5\b',
            '864e5',
            js,
            name=f"{js_name}:idle_disconnect_timeout",
            critical=False
        )
        modified = True

    # E. Replace any remaining literal " - KasmVNC"
    if ' - KasmVNC' in js:
        js = tracker.tracked_replace(
            js,
            ' - KasmVNC',
            '',
            name=f"{js_name}:remove_kasmvnc_suffix",
            critical=False
        )
        modified = True

    # F. Keepalive & Reconnect patches for minified bundles if present
    target_disconnect = 'if(o.connected=!1,o.rfb=void 0,o.monitors=[],o.sortedMonitors=[],!n.detail.clean)o.updateVisualState("disconnected"),e?o.showStatus(rr("Something went wrong, connection is closed"),"error"):o.showStatus(rr("Failed to connect to server"),"error");else if(o.getSetting("reconnect",!1)===!0&&!o.inhibitReconnect){o.updateVisualState("reconnecting");const t=parseInt(o.getSetting("reconnect_delay"));o.reconnectCallback=setTimeout(o.reconnect,t);return}'
    reconnect_patch = 'if(o.connected=!1,o.rfb=void 0,o.monitors=[],o.sortedMonitors=[],o.getSetting("reconnect",!0)===!0&&!o.inhibitReconnect){o.updateVisualState("reconnecting");const t=parseInt(o.getSetting("reconnect_delay"))||2e3;o.reconnectCallback=setTimeout(o.reconnect,t);return}else if(!n.detail.clean)o.updateVisualState("disconnected"),e?o.showStatus(rr("Something went wrong, connection is closed"),"error"):o.showStatus(rr("Failed to connect to server"),"error");'
    if target_disconnect in js:
        js = tracker.tracked_replace(
            js,
            target_disconnect,
            reconnect_patch,
            name=f"{js_name}:minified_reconnect_patch",
            critical=False
        )
        modified = True

    # Unminified disconnectFinished patch (app/ui.js)
    if "disconnectFinished(e) {" in js and "const wasConnected = UI.connected;" in js:
        old_df = """        if (!e.detail.clean) {
            UI.updateVisualState('disconnected');
            if (wasConnected) {
                UI.showStatus(_("Something went wrong, connection is closed"),
                              'error');
            } else {
                UI.showStatus(_("Failed to connect to server"), 'error');
            }
        } else if (UI.getSetting('reconnect', false) === true && !UI.inhibitReconnect) {"""
        new_df = """        if (UI.getSetting('reconnect', true) === true && !UI.inhibitReconnect) {
            UI.updateVisualState('reconnecting');

            const delay = parseInt(UI.getSetting('reconnect_delay')) || 2000;
            UI.reconnectCallback = setTimeout(UI.reconnect, delay);
            return;
        } else if (!e.detail.clean) {
            UI.updateVisualState('disconnected');
            if (wasConnected) {
                UI.showStatus(_("Something went wrong, connection is closed"),
                              'error');
            } else {
                UI.showStatus(_("Failed to connect to server"), 'error');
            }
        } else {"""
        if old_df in js:
            js = tracker.tracked_replace(
                js,
                old_df,
                new_df,
                name=f"{js_name}:unminified_reconnect_patch",
                critical=False
            )
            modified = True

    target_keepalive = '):document.getElementById("noVNC_status").style.visibility="visible"'
    keepalive_patch = '):(document.getElementById("noVNC_status").style.visibility="visible",o._sessionTimeoutInterval=setInterval(function(){o.rfb&&o.connected&&o.rfb.sendKeepAlive()},5e3))'
    if target_keepalive in js:
        js = tracker.tracked_replace(
            js,
            target_keepalive,
            keepalive_patch,
            name=f"{js_name}:keepalive_patch",
            critical=False
        )
        modified = True

    # G. Video quality defaults
    if 'o.initSetting("video_quality",2)' in js:
        js = tracker.tracked_replace(
            js,
            'o.initSetting("video_quality",2)',
            'o.initSetting("video_quality",3)',
            name=f"{js_name}:initSetting_video_quality_min_2to3",
            critical=False
        )
        js = tracker.tracked_replace(
            js,
            'Gt()&&o.initSetting("video_quality",hr("video_quality",2))',
            'Gt()&&o.initSetting("video_quality",hr("video_quality",3))',
            name=f"{js_name}:initSetting_video_quality_gt_2to3",
            critical=False
        )
        js = tracker.tracked_replace(
            js,
            'o.updateSetting("video_quality",2)',
            'o.updateSetting("video_quality",3)',
            name=f"{js_name}:updateSetting_video_quality_min_2to3",
            critical=False
        )
        modified = True

    if modified:
        with open(js_file, "w", encoding="utf-8") as f:
            f.write(js)
        print(f"[Brand] Successfully patched KasmVNC JS in {os.path.basename(js_file)}")

# 5b. Patch locale files to rename "High" / "Alto" preset translation to "VisualVibe"
locale_dir = os.path.join(WWW_DIR, "app", "locale")
if os.path.isdir(locale_dir):
    for loc_file in sorted(glob.glob(os.path.join(locale_dir, "*.json"))):
        loc_name = os.path.basename(loc_file)
        try:
            with open(loc_file, "r", encoding="utf-8") as f:
                loc_data = f.read()
            if '"High":' in loc_data:
                loc_data = tracker.tracked_sub(
                    r'"High"\s*:\s*"[^"]*"',
                    '"High": "VisualVibe"',
                    loc_data,
                    name=f"{loc_name}:rename_high_label",
                    critical=False
                )
                with open(loc_file, "w", encoding="utf-8") as f:
                    f.write(loc_data)
        except Exception as e:
            print(f"[Brand] Warning: Could not patch {loc_file}: {e}")

# 6. Patch /usr/bin/vncserver to use http:// and show both VisualVibe Electron & FileBrowser Quantum
vncserver_path = "/usr/bin/vncserver"
if os.path.isfile(vncserver_path):
    try:
        with open(vncserver_path, "r", encoding="utf-8") as f:
            vnc_script = f.read()

        vnc_modified = False

        # Fix uninitialized $desktopName warning on line 2837
        if "$desktopName //=" not in vnc_script:
            vnc_script = tracker.tracked_replace(
                vnc_script,
                "$logger->warn(\"\\nNew '$desktopName' desktop is $host:$displayNumber\");",
                "$desktopName //= 'VisualVibe Electron';\n  $logger->warn(\"\\nNew '$desktopName' desktop is $host:$displayNumber\");",
                name="vncserver:init_desktop_name",
                critical=False
            )
            vnc_modified = True

        # Fix URL scheme from https to http
        if 'my @urls = map { "https://$_:$browserPort" } @browserHosts;' in vnc_script:
            vnc_script = tracker.tracked_replace(
                vnc_script,
                'my @urls = map { "https://$_:$browserPort" } @browserHosts;',
                'my @urls = map { "http://$_:$browserPort" } @browserHosts;',
                name="vncserver:url_scheme_http",
                critical=False
            )
            vnc_modified = True

        # Replace single VNC URL with VisualVibe Electron and FileBrowser Quantum URLs
        old_print_url = '$logger->warn("\\nPaste this url in your browser:\\n$browserUrls");'
        new_print_url = (
            'my @hosts = DeduceBrowserHosts();\n'
            '  my $host_ip = $hosts[0] || "127.0.0.1";\n'
            '  $logger->warn("\\nVisualVibe Electron:     http://$host_ip:8080\\n'
            'FileBrowser Quantum:  http://$host_ip:8081/filebrowser\\n");'
        )
        if old_print_url in vnc_script:
            vnc_script = tracker.tracked_replace(
                vnc_script,
                old_print_url,
                new_print_url,
                name="vncserver:dual_service_urls",
                critical=False
            )
            vnc_modified = True

        if vnc_modified:
            with open(vncserver_path, "w", encoding="utf-8") as f:
                f.write(vnc_script)
            print("[Brand] Successfully patched /usr/bin/vncserver (HTTP URLs & service branding)")
    except Exception as e:
        print(f"[Brand] Warning: Could not patch {vncserver_path}: {e}")

# 7. Marker file
with open(os.path.join(assets_dir, ".visualvibe_branded"), "w") as f:
    f.write("branded\n")

print("[Brand] VisualVibe Electron branding & vector splash screen applied cleanly.")

# 8. Final validation report
tracker.exit_if_failures()
