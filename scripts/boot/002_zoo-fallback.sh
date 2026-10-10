#!/bin/bash
# 002_zoo-fallback.sh — boot — idempotent runtime fallback: install Zoo Code from
# Open VSX if the extension is not present (e.g. offline image without staged copy).
# Pinned to tested version 3.86.0 for deterministic builds and patch compatibility.
set -e

ZOO_VERSION="3.86.0"
ZOO_EXT_ID="zoocodeorganization.zoo-code"
# Check by directory presence (code-server CLI isn't running yet at boot time).
if ! ls -d /home/vvelectron/.local/share/code-server/extensions/*zoo-code* >/dev/null 2>&1; then
    echo "[Extensions] Zoo Code not found, downloading version ${ZOO_VERSION} from Open VSX..."
    VSIX_URL="https://open-vsx.org/api/ZooCodeOrganization/zoo-code/${ZOO_VERSION}/file/ZooCodeOrganization.zoo-code-${ZOO_VERSION}.vsix"
    VSIX_TMP="/tmp/zoo-code-${ZOO_VERSION}.vsix"
    if curl -fsSL --max-time 120 -o "${VSIX_TMP}" "${VSIX_URL}"; then
        runuser -u vvelectron -- code-server --install-extension "${VSIX_TMP}" 2>/dev/null || true
        rm -f "${VSIX_TMP}"
        echo "[Extensions] Zoo Code installed successfully."
    else
        rm -f "${VSIX_TMP}"
        echo "[Extensions] WARNING: Could not download Zoo Code VSIX (offline?). Continuing anyway."
    fi
else
    echo "[Extensions] Zoo Code extension already installed. Skipping."
fi
