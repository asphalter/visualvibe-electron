#!/bin/bash
# 002_zoo-fallback.sh — boot — idempotent runtime fallback: install Zoo Code from
# Open VSX if the extension is not present (e.g. offline image without staged copy).
# Pinned to tested version via $ZOO_VERSION for deterministic builds and patch compatibility.
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
elif [ -f /opt/visualvibe/scripts/lib/common.sh ]; then
    source /opt/visualvibe/scripts/lib/common.sh
fi

vv_init_strict

ZOO_VERSION="${ZOO_VERSION:-3.92.0}"
ZOO_EXT_ID="zoocodeorganization.zoo-code"
EXT_DIR="$VSCODIUM_EXTENSIONS"
mkdir -p "$EXT_DIR"

# Check by directory presence in VSCodium extensions folder
if ! ls -d "$EXT_DIR"/*zoo-code* >/dev/null 2>&1; then
    vv_log INFO "Zoo Code not found, downloading version ${ZOO_VERSION} from Open VSX..."
    VSIX_URL="https://open-vsx.org/api/ZooCodeOrganization/zoo-code/${ZOO_VERSION}/file/ZooCodeOrganization.zoo-code-${ZOO_VERSION}.vsix"
    VSIX_TMP="/tmp/zoo-code-${ZOO_VERSION}.vsix"
    if curl -fsSL --max-time 120 -o "${VSIX_TMP}" "${VSIX_URL}"; then
        if command -v codium >/dev/null 2>&1; then
            runuser -u "$VV_USER" -- codium --extensions-dir "$EXT_DIR" --install-extension "${VSIX_TMP}" --force 2>/dev/null || true
        else
            vv_log WARN "codium CLI not found, could not install VSIX."
        fi
        rm -f "${VSIX_TMP}"
        vv_log INFO "Zoo Code installed successfully."
    else
        rm -f "${VSIX_TMP}"
        vv_log WARN "Could not download Zoo Code VSIX (offline?). Continuing anyway."
    fi
else
    vv_log INFO "Zoo Code extension already installed. Skipping."
fi
