#!/bin/bash
# 000_disable-copilot.sh — boot — remove any bundled GitHub Copilot / Copilot Chat
# extensions across system and user extension paths (idempotent).
# Note: In VS Code 1.140+, the core "Chat" view container (workbench.panel.chat) is built
# into the workbench rather than an extension, and is hidden by 004_patch-workbench-activitybar.py.
set -e

removed=0
for pattern in "*copilot*" "*copilot-chat*" "github.copilot*"; do
    for base in "/usr/lib/code-server/lib/vscode/extensions" "/home/vvelectron/.local/share/code-server/extensions"; do
        for dir in "$base"/$pattern; do
            if [ -d "$dir" ]; then
                rm -rf "$dir"
                echo "[Copilot] Removed extension directory: $dir"
                removed=$((removed + 1))
            fi
        done
    done
done

if [ "$removed" -eq 0 ]; then
    echo "[Copilot] No Copilot extension directories present (workbench.panel.chat hidden via workbench patch)."
fi
