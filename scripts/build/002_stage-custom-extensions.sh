#!/bin/bash
# 002_stage-custom-extensions.sh — build — rename the custom VisualVibe extensions
# (copied by the Containerfile) to the standard VS Code / VSCodium "publisher.name-version" layout
# so they are recognized as installed extensions.
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
elif [ -f /opt/visualvibe/scripts/lib/common.sh ]; then
    source /opt/visualvibe/scripts/lib/common.sh
fi

vv_init_strict

if [ -d "$VV_EXTENSIONS/vv-project-picker" ]; then
    mv "$VV_EXTENSIONS/vv-project-picker" "$VV_EXTENSIONS/visualvibe.vv-project-picker-1.0.0"
fi
if [ -d "$VV_EXTENSIONS/vv-update-checker" ]; then
    mv "$VV_EXTENSIONS/vv-update-checker" "$VV_EXTENSIONS/visualvibe.vv-update-checker-1.0.0"
fi
vv_log INFO "Staged custom extensions successfully."
