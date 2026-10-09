#!/bin/bash
# 000_disable-copilot.sh — boot — remove the bundled GitHub Copilot Chat built-in
# extension so its "Chat" view does not appear in the Secondary Side Bar alongside
# Zoo Code (idempotent; also guards against the extension reappearing).
set -e

CODIR="/usr/lib/code-server/lib/vscode/extensions/copilot"
if [ -d "$CODIR" ]; then
    rm -rf "$CODIR"
    echo "[Copilot] Removed bundled GitHub Copilot Chat extension."
else
    echo "[Copilot] Copilot extension already absent."
fi
