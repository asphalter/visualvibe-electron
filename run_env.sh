#!/bin/bash

# ==============================================================================
# run_env.sh — Launch VisualVibe Electron Web Environment (Remote Desktop IDE)
#
# Usage:
#   ./run_env.sh                              # Launch on default port 80
#   VISUALVIBE_PORT=9090 ./run_env.sh         # Launch on custom port
#
# Key Features:
#   - Web Remote Desktop (VSCodium + Openbox + KasmVNC), proxied by Caddy on port 80
#   - Auth: open (perimeter security model)
#   - Web File Manager (Upload/Download) integrated into side panel
#   - Unauthenticated container access (secure with your own reverse proxy / tunnel)
#   - VS Code + Zoo Code extension with configurable AI agent endpoint
#   - Rootless Podman-in-Podman container runtime
#   - Resource allocation: Host defaults (unrestricted CPU & RAM)
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

IMAGE_NAME="${VISUALVIBE_IMAGE:-visualvibe-electron}"
CONTAINER_NAME="${VISUALVIBE_CONTAINER:-visualvibe-electron}"
VOLUME_NAME="${VISUALVIBE_VOLUME:-visualvibe-home}"
HOST_PORT="${VISUALVIBE_PORT:-80}"
AI_API_URL="${AI_API_URL:-}"
AI_API_KEY="${AI_API_KEY:-}"
AI_LANG="${AI_LANG:-}"
# FIX R-01: --no-build flag skips the image build step for faster restarts
SKIP_BUILD=false
for _arg in "$@"; do
    case "$_arg" in
        --no-build) SKIP_BUILD=true ;;
        --help|-h)
            echo "Usage: ./run_env.sh [--no-build]"
            echo "  --no-build   Skip image build (use existing image)"
            exit 0
            ;;
    esac
done

# Output styling colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Display official VisualVibe Electron ASCII banner
if [ -f "${SCRIPT_DIR}/scripts/print_banner.sh" ]; then
    "${SCRIPT_DIR}/scripts/print_banner.sh"
fi

echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  VisualVibe Electron — Web IDE Environment${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Web IDE Port:        ${BOLD}${HOST_PORT}${NC}"
echo -e "  FileBrowser Path:    ${BOLD}http://localhost:${HOST_PORT}/filebrowser/${NC}"
echo -e "  Image:               ${BOLD}${IMAGE_NAME}${NC}"
echo -e "  Container:           ${BOLD}${CONTAINER_NAME}${NC}"
echo -e "  Home Volume:         ${BOLD}${VOLUME_NAME}${NC}"
echo -e "  AI API URL:          ${BOLD}${AI_API_URL:-<not set>}${NC}"
echo -e "  AI API Key:          ${BOLD}$([ -n "${AI_API_KEY:-}" ] && echo "<configured>" || echo "<not set>")${NC}"
echo -e "  AI Language:         ${BOLD}${AI_LANG:-<not set>}${NC}"
echo ""

# Validate mandatory environment variables
MISSING_VARS=()
[ -z "${AI_LANG:-}" ] && MISSING_VARS+=("AI_LANG")
[ -z "${AI_API_KEY:-}" ] && MISSING_VARS+=("AI_API_KEY")
[ -z "${AI_API_URL:-}" ] && MISSING_VARS+=("AI_API_URL")

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "${RED}[FATAL ERROR] Startup aborted: missing required environment variable(s):${NC}" >&2
    for var in "${MISSING_VARS[@]}"; do
        echo -e "  - ${BOLD}$var${NC}" >&2
    done
    echo "" >&2
    echo -e "${YELLOW}Reason:${NC} AI_LANG, AI_API_KEY, and AI_API_URL must be configured before running VisualVibe Electron." >&2
    echo -e "${YELLOW}Example:${NC} AI_LANG=en AI_API_KEY=sk-... AI_API_URL=https://api.openai.com/v1 ./run_env.sh" >&2
    echo "" >&2
    exit 1
fi


# --------------------------------------------------------------------------
# 1. Build container image
# --------------------------------------------------------------------------
if [ "$SKIP_BUILD" = true ]; then
    echo -e "${YELLOW}[1/4]${NC} Skipping build (--no-build flag set). Using existing image ${IMAGE_NAME}."
else
    echo -e "${YELLOW}[1/4]${NC} Building container image ${IMAGE_NAME}..."
    podman build -t "${IMAGE_NAME}" . < /dev/null
    echo -e "${GREEN}[OK]${NC} Container image built successfully."
fi
echo ""

# --------------------------------------------------------------------------
# 2. Cleanup previous container instances
# --------------------------------------------------------------------------
echo -e "${YELLOW}[2/4]${NC} Checking for existing containers..."
if podman ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "       Existing container '${CONTAINER_NAME}' found. Removing..."
    podman rm -f "${CONTAINER_NAME}" > /dev/null 2>&1
    echo -e "${GREEN}[OK]${NC} Previous container removed."
else
    echo -e "${GREEN}[OK]${NC} No conflicting container found."
fi
echo ""

# --------------------------------------------------------------------------
# 3. Create or reuse persistent home volume
# --------------------------------------------------------------------------
echo -e "${YELLOW}[3/4]${NC} Preparing persistent volume ${VOLUME_NAME}..."
if ! podman volume exists "${VOLUME_NAME}" 2>/dev/null; then
    podman volume create "${VOLUME_NAME}" > /dev/null
    echo -e "${GREEN}[OK]${NC} Volume created successfully."
else
    echo -e "${GREEN}[OK]${NC} Existing persistent volume reused."
fi
echo ""

# --------------------------------------------------------------------------
# 4. Start container
# --------------------------------------------------------------------------
echo -e "${YELLOW}[4/4]${NC} Starting container ${CONTAINER_NAME}..."

podman run -d \
    --name "${CONTAINER_NAME}" \
    --privileged \
    --shm-size=2g \
    -e AI_API_URL="${AI_API_URL}" \
    -e AI_API_KEY="${AI_API_KEY}" \
    -e AI_LANG="${AI_LANG}" \
    -v "${VOLUME_NAME}:/home/vvelectron" \
    -p "${HOST_PORT}:80" \
    "${IMAGE_NAME}" < /dev/null

echo -e "${GREEN}[OK]${NC} Container started."
echo ""

# --------------------------------------------------------------------------
# Summary and access instructions
# --------------------------------------------------------------------------
echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ VisualVibe Electron environment is ready!${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Web Browser Access:${NC}"
echo -e "    VisualVibe Electron:     ${BOLD}http://localhost:${HOST_PORT}/${NC}"
echo -e "    FileBrowser Quantum:  ${BOLD}http://localhost:${HOST_PORT}/filebrowser/${NC}"
echo -e "    Authentication:   None (open \u2014 perimeter security model)"
echo -e "    Proxy:            Caddy routes /filebrowser/* → loopback 127.0.0.1:8081, all else → KasmVNC loopback 127.0.0.1:8444"
echo ""
echo -e "  ${CYAN}Environment Features:${NC}"
echo -e "    ✓ Base OS: AlmaLinux 9 (English en_US.UTF-8 locale)"
echo -e "    ✓ Reverse Proxy: Caddy on port ${HOST_PORT}"
echo -e "    ✓ IDE: VSCodium + Openbox + KasmVNC with Zoo Code AI agent extension"
echo -e "    ✓ Container runtime: Rootless Podman-in-Podman (/dev/fuse + fuse-overlayfs)"
echo -e "    ✓ Resources: Unrestricted CPU & RAM (Host defaults)"
echo -e "    ✓ Persistence: Volume '${VOLUME_NAME}' mounted at /home/vvelectron"
echo ""
echo -e "  ${CYAN}Management Commands:${NC}"
echo -e "    View logs:        podman logs -f ${CONTAINER_NAME}"
echo -e "    Enter shell:      podman exec -it -u vvelectron ${CONTAINER_NAME} bash"
echo -e "    Stop container:   podman stop ${CONTAINER_NAME}"
echo -e "    Start container:  podman start ${CONTAINER_NAME}"
echo -e "    Remove container: podman rm -f ${CONTAINER_NAME}"
echo ""
echo -e "  ${CYAN}Health Check:${NC}"
echo -e "    curl -s -o /dev/null -w "%{http_code}\n" http://localhost:${HOST_PORT}/"
echo ""
echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
