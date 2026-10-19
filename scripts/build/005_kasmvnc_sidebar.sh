#!/bin/bash
# 005_kasmvnc_sidebar.sh — build — applica il branding completo della sidebar KasmVNC.
# Porta in VisualVibe Electron le personalizzazioni del menu laterale realizzate in
# VisualVibe Agent: logo/branding card, pulsanti Switch Window e Open Browser,
# quick-link FileBrowser, splash screen, keep-alive e default qualità video.
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
elif [ -f /opt/visualvibe/scripts/lib/common.sh ]; then
    source /opt/visualvibe/scripts/lib/common.sh
fi

vv_init_strict

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
python3 "$SCRIPT_DIR/005_kasmvnc_sidebar.py"
vv_log INFO "Applied KasmVNC sidebar branding."
