#!/usr/bin/env python3
"""
brand_workbench.py - Apply VisualVibe branding to code-server workbench:
1. Replaces code-icon.svg across code-server and extensions with VisualVibe logo SVG.
2. Injects custom CSS rules into workbench.css & workbench.html for the top-left app icon only.
   (The hamburger menu icon and empty-editor watermark are NOT modified.)
"""
import base64
import glob
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)

CANDIDATE_ICONS = [
    "/opt/visualvibe/media/pwa-icon-256.png",
    "/opt/visualvibe/media/pwa-icon-512.png",
    os.path.join(PROJECT_DIR, "media", "pwa-icon-256.png"),
    os.path.join(PROJECT_DIR, "media", "pwa-icon-512.png"),
]

def find_icon():
    for p in CANDIDATE_ICONS:
        if os.path.exists(p):
            return p
    return None

def main():
    icon_path = find_icon()
    if not icon_path:
        sys.exit(f"ERROR: No suitable VisualVibe icon found in {CANDIDATE_ICONS}")

    print(f"[brand_workbench] Using source icon: {icon_path}")
    with open(icon_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")

    data_uri = f"data:image/png;base64,{b64}"

    code_svg = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        'viewBox="0 0 256 256" width="256" height="256">\n'
        f'  <image width="256" height="256" href="{data_uri}" xlink:href="{data_uri}"/>\n'
        '</svg>\n'
    )

    for p in glob.glob("/usr/lib/code-server/**/code-icon.svg", recursive=True):
        try:
            with open(p, "w", encoding="utf-8") as f:
                f.write(code_svg)
            print(f"[brand_workbench] Replaced code-icon.svg: {p}")
        except Exception as e:
            print(f"[brand_workbench] Warning {p}: {e}")

    # Custom CSS override: ONLY the top-left product icon in titlebar (.window-appicon)
    # The hamburger menu (.menubar.compact .toolbar-toggle-more) is NOT touched.
    custom_css = f"""
/* VisualVibe Branding Overrides */
.monaco-workbench .part.titlebar .window-appicon,
.monaco-workbench .part.titlebar>.titlebar-container>.titlebar-left>.window-appicon {{
    background-image: url("{data_uri}") !important;
    background-size: 20px 20px !important;
    background-repeat: no-repeat !important;
    background-position: center center !important;
}}
.monaco-workbench .part.titlebar .window-appicon.codicon:before {{
    content: "" !important;
    display: none !important;
}}
"""
    wb_css = "/usr/lib/code-server/lib/vscode/out/vs/code/browser/workbench/workbench.css"
    if os.path.exists(wb_css):
        with open(wb_css, "r", encoding="utf-8") as f:
            c = f.read()
        if "VisualVibe Branding Overrides" not in c:
            with open(wb_css, "a", encoding="utf-8") as f:
                f.write("\n" + custom_css + "\n")
            print(f"[brand_workbench] Appended CSS to {wb_css}")

    wb_html = "/usr/lib/code-server/lib/vscode/out/vs/code/browser/workbench/workbench.html"
    if os.path.exists(wb_html):
        with open(wb_html, "r", encoding="utf-8") as f:
            h = f.read()
        if "VisualVibe Branding Overrides" not in h:
            h = h.replace("</head>", f"<style>{custom_css}</style>\n</head>")
            with open(wb_html, "w", encoding="utf-8") as f:
                f.write(h)
            print(f"[brand_workbench] Injected CSS into {wb_html}")

    print("[brand_workbench] Completed successfully.")

if __name__ == "__main__":
    main()
