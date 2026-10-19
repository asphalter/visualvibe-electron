#!/bin/bash
# 000_disable-copilot.sh — boot — remove any bundled GitHub Copilot / Copilot Chat
# extensions across system and user extension paths (idempotent).
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
elif [ -f /opt/visualvibe/scripts/lib/common.sh ]; then
    source /opt/visualvibe/scripts/lib/common.sh
fi

vv_init_strict

removed=0
for pattern in "*copilot*" "*copilot-chat*" "github.copilot*"; do
    for base in "/usr/share/codium/resources/app/extensions" "$VSCODIUM_EXTENSIONS"; do
        for dir in "$base"/$pattern; do
            if [ -d "$dir" ]; then
                rm -rf "$dir"
                vv_log INFO "Removed extension directory: $dir"
                removed=$((removed + 1))
            fi
        done
    done
done

if [ "$removed" -eq 0 ]; then
    vv_log INFO "No Copilot extension directories present."
fi
