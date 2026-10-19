#!/bin/bash
# 012_fix-extension-ownership.sh — boot — ensure VSCodium config and extensions
# are owned by vvelectron on the persistent volume (idempotent).
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
elif [ -f /opt/visualvibe/scripts/lib/common.sh ]; then
    source /opt/visualvibe/scripts/lib/common.sh
fi

vv_init_strict

chown -R "${VV_USER}:${VV_USER}" "$VSCODIUM_DATA" 2>/dev/null || true
chown -R "${VV_USER}:${VV_USER}" "$VSCODIUM_CONFIG" 2>/dev/null || true
vv_log INFO "Extension and config ownership verified."
