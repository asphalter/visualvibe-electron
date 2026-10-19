#!/bin/bash
set -e

# If custom command arguments are passed, execute them directly
if [ $# -gt 0 ]; then
    exec "$@"
fi

# 0. Validate mandatory environment variables
missing_vars=()
[ -z "${AI_LANG:-}" ] && missing_vars+=("AI_LANG")
[ -z "${AI_API_KEY:-}" ] && missing_vars+=("AI_API_KEY")
[ -z "${AI_API_URL:-}" ] && missing_vars+=("AI_API_URL")

if [ ${#missing_vars[@]} -gt 0 ]; then
    echo "==========================================================" >&2
    echo " [FATAL ERROR] Container startup aborted!" >&2
    echo "==========================================================" >&2
    echo " Exception: Missing required environment variable(s):" >&2
    for var in "${missing_vars[@]}"; do
        echo "   - $var" >&2
    done
    echo "" >&2
    echo " Reason: VisualVibe Electron requires AI_LANG, AI_API_KEY, and AI_API_URL" >&2
    echo " to be configured before starting the environment." >&2
    echo " Example:" >&2
    echo "   -e AI_LANG=en -e AI_API_KEY=sk-... -e AI_API_URL=https://api.openai.com/v1" >&2
    echo "==========================================================" >&2
    exit 1
fi

# Source centralized helpers and paths
if [ -f "$(dirname "${BASH_SOURCE[0]}")/scripts/lib/common.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/scripts/lib/common.sh"
elif [ -f /opt/visualvibe/scripts/lib/common.sh ]; then
    source /opt/visualvibe/scripts/lib/common.sh
fi

# Print official VisualVibe Electron neon banner on container startup
if [ -f "${VV_SCRIPTS}/print_banner.sh" ]; then
    bash "${VV_SCRIPTS}/print_banner.sh"
fi

echo "=========================================================="
echo "    Initializing VisualVibe Electron (VSCodium + KasmVNC)"
echo "=========================================================="

# 1. Ensure permissions on /dev/fuse for nested Podman
if [ -e /dev/fuse ]; then
    chmod 666 /dev/fuse 2>/dev/null || true
fi

# 2. Setup home directory and ownership for vvelectron user
mkdir -p "$VV_HOME" "$VV_WORKDIRS"
chown "${VV_USER}:${VV_USER}" "$VV_HOME" "$VV_WORKDIRS"

# Ensure XDG and runtime directories exist
export XDG_RUNTIME_DIR="/tmp/runtime-${VV_USER}"
mkdir -p "$XDG_RUNTIME_DIR" "${VV_HOME}/.config" "${VV_HOME}/.cache" "$VSCODIUM_DATA"
chmod 700 "$XDG_RUNTIME_DIR"
chown -R "${VV_USER}:${VV_USER}" "$XDG_RUNTIME_DIR" "${VV_HOME}/.config" "${VV_HOME}/.cache" "$VSCODIUM_DATA"

# 3. Setup persistent Podman storage
PODMAN_STORAGE="${VV_HOME}/.local/share/containers/storage"
mkdir -p "$PODMAN_STORAGE"
chown -R "${VV_USER}:${VV_USER}" "${VV_HOME}/.local" 2>/dev/null || true

# 4. Generate persistent self-signed TLS certificates for Caddy
CERTS_DIR="${VV_HOME}/.config/caddy/certs"
mkdir -p "$CERTS_DIR"
if [ ! -f "$CERTS_DIR/cert.pem" ] || [ ! -f "$CERTS_DIR/key.pem" ]; then
    vv_log INFO "Generating self-signed TLS certificate with IP SANs..."
    CONTAINER_IPS=$(hostname -I 2>/dev/null || true)
    SAN_ENTRIES="IP:127.0.0.1,DNS:localhost"
    for ip in $CONTAINER_IPS; do
        SAN_ENTRIES="$SAN_ENTRIES,IP:$ip"
    done
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout "$CERTS_DIR/key.pem" \
        -out "$CERTS_DIR/cert.pem" \
        -subj "/CN=VisualVibe-Electron" \
        -addext "subjectAltName=$SAN_ENTRIES" >/dev/null 2>&1 || {
            openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
                -keyout "$CERTS_DIR/key.pem" \
                -out "$CERTS_DIR/cert.pem" \
                -subj "/CN=VisualVibe-Electron" >/dev/null 2>&1
        }
    chmod 600 "$CERTS_DIR/key.pem" "$CERTS_DIR/cert.pem"
    chown -R "${VV_USER}:${VV_USER}" "${VV_HOME}/.config/caddy"
fi

# 5. Execute modular boot scripts (error-resilient for container PID 1 stability)
BOOT_DIR="$VV_BOOT_DIR"
if [ -d "$BOOT_DIR" ]; then
    vv_log INFO "Executing boot scripts from $BOOT_DIR..."
    for script in $(ls "$BOOT_DIR" | sort); do
        script_path="$BOOT_DIR/$script"
        if [ -f "$script_path" ]; then
            case "$script" in
                *.sh)
                    vv_log INFO "Running boot shell script: $script"
                    if ! bash "$script_path"; then
                        vv_log WARN "Boot shell script $script exited with code $? (continuing)"
                    fi
                    ;;
                *.py)
                    vv_log INFO "Running boot Python script: $script"
                    if ! python3 "$script_path"; then
                        vv_log WARN "Boot Python script $script exited with code $? (continuing)"
                    fi
                    ;;
            esac
        fi
    done
fi

# 6. Readiness check helper function
wait_for_http() {
    local url="$1"
    local label="$2"
    local timeout="${3:-30}"
    local logfile="$4"
    local pid="${5:-}"
    local allow_auth="${6:-false}"
    local elapsed=0

    echo "[$label] Waiting for service readiness at $url (timeout: ${timeout}s)..."
    while [ "$elapsed" -lt "$timeout" ]; do
        local status_code
        status_code=$(curl -k -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
        if [ "$status_code" -ge 200 ] && [ "$status_code" -lt 400 ]; then
            echo "[$label] Service is ready and responding (HTTP $status_code)."
            return 0
        elif [ "$allow_auth" = "true" ] && { [ "$status_code" = "401" ] || [ "$status_code" = "502" ]; }; then
            echo "[$label] Service is ready and responding (HTTP $status_code)."
            return 0
        fi
        if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
            echo "[$label] FATAL: Process (PID $pid) died unexpectedly during startup!" >&2
            break
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    echo "==========================================================" >&2
    echo " [FATAL ERROR] $label failed to become ready within ${timeout}s!" >&2
    echo "==========================================================" >&2
    if [ -n "$logfile" ] && [ -f "$logfile" ]; then
        echo "[$label] Process log output:" >&2
        cat "$logfile" >&2
    fi
    exit 1
}

# 7. Start D-Bus session bus
echo "[D-Bus] Starting D-Bus session bus..."
mkdir -p /run/user/1000 /tmp/dbus
chown -R "${VV_USER}:${VV_USER}" /run/user/1000 /tmp/dbus 2>/dev/null || true
export DBUS_SESSION_BUS_ADDRESS="unix:path=/tmp/dbus/session.sock"
rm -f /tmp/dbus/session.sock
runuser -u "$VV_USER" -- dbus-daemon --session --address="$DBUS_SESSION_BUS_ADDRESS" --fork --nopidfile || true

# 8. Setup KasmVNC authentication & configuration
DISPLAY_NUM=":1"
export DISPLAY="$DISPLAY_NUM"
KASM_USER_PASS="visualvibe"
echo "[KasmVNC] Configuring KasmVNC authentication for user ${VV_USER}..."
mkdir -p "${VV_HOME}/.vnc" /tmp/.X11-unix
chmod 1777 /tmp/.X11-unix
cp -f "${VV_CONFIG}/kasmvnc.yaml" "${VV_HOME}/.vnc/kasmvnc.yaml" 2>/dev/null || true
cp -f "${VV_CONFIG}/kasmvnc.yaml" /etc/kasmvnc/kasmvnc.yaml 2>/dev/null || true

# Configure user in .kasmpasswd atomically
printf "%s\n%s\n" "$KASM_USER_PASS" "$KASM_USER_PASS" | runuser -u "$VV_USER" -- kasmvncpasswd -u "$VV_USER" -w
chown -R "${VV_USER}:${VV_USER}" "${VV_HOME}/.vnc" "${VV_HOME}/.kasmpasswd"

# Clean any stale lockfiles or sockets for DISPLAY_NUM
rm -f "/tmp/.X11-unix/X${DISPLAY_NUM#:}" "/tmp/.X${DISPLAY_NUM#:}-lock"

# 9. Start KasmVNC Server (which launches Xvnc on DISPLAY_NUM with built-in WebSocket & web UI)
echo "[KasmVNC] Starting KasmVNC server on display $DISPLAY_NUM (port 8444)..."
if command -v kasmvncserver >/dev/null 2>&1; then
    DISPLAY="$DISPLAY_NUM" runuser -u "$VV_USER" -- \
        kasmvncserver "$DISPLAY_NUM" \
        -desktop "VisualVibe Electron" \
        -websocketPort 8444 \
        -interface 127.0.0.1 \
        -noxstartup \
        -DisableBasicAuth \
        -SecurityTypes None \
        > /tmp/kasmvnc.log 2>&1 &
elif command -v vncserver >/dev/null 2>&1; then
    DISPLAY="$DISPLAY_NUM" runuser -u "$VV_USER" -- \
        vncserver "$DISPLAY_NUM" \
        -desktop "VisualVibe Electron" \
        -websocketPort 8444 \
        -interface 127.0.0.1 \
        -noxstartup \
        -DisableBasicAuth \
        -SecurityTypes None \
        > /tmp/kasmvnc.log 2>&1 &
else
    echo "[KasmVNC] WARN: kasmvncserver binary not found, checking fallback paths..."
fi

# Wait for X11 socket created by Xvnc to appear and verify readiness
vv_wait_for_display "$DISPLAY_NUM" 30 "KasmVNC display ($DISPLAY_NUM)" || true
vv_wait_for_port 8444 30 "KasmVNC WebSocket (port 8444)" || true

# Find Xvnc daemon PID written by vncserver into ~/.vnc/<host>:<display>.pid
VNC_PID=""
for pidfile in "${VV_HOME}/.vnc/"*"${DISPLAY_NUM}".pid; do
    if [ -f "$pidfile" ]; then
        VNC_PID="$(cat "$pidfile" 2>/dev/null | tr -d '[:space:]')"
        [ -n "$VNC_PID" ] && break
    fi
done
if [ -z "$VNC_PID" ]; then
    VNC_PID="$(pgrep -u "$VV_USER" -x Xvnc 2>/dev/null || true)"
fi
echo "[KasmVNC] Xvnc daemon running with PID $VNC_PID."

wait_for_http "http://127.0.0.1:8444" "KasmVNC" 30 "/tmp/kasmvnc.log" "$VNC_PID" "false"

# 10. Start Openbox Window Manager in kiosk mode
echo "[Openbox] Starting Openbox kiosk window manager..."
OPENBOX_CONFIG="${VV_CONFIG}/openbox/rc.xml"
DISPLAY="$DISPLAY_NUM" runuser -u "$VV_USER" -- openbox --config-file "$OPENBOX_CONFIG" > /tmp/openbox.log 2>&1 &
OPENBOX_PID=$!
vv_wait_for_process "openbox" 30 "Openbox window manager" || true

# 11. Start VSCodium as native desktop GUI on X11
echo "[VSCodium] Starting VSCodium IDE on display $DISPLAY_NUM..."
WORKDIRS_PATH="$VV_WORKDIRS"
INITIAL_MARKER="${VSCODIUM_CONFIG}/.initial_workspace_done"

# Verify X display and window manager are active before starting VSCodium
vv_wait_for_display "$DISPLAY_NUM" 30 "KasmVNC X display for VSCodium" || true
vv_wait_for_process "openbox" 30 "Openbox for VSCodium" || true

if [ ! -f "$INITIAL_MARKER" ]; then
    echo "[VSCodium] Initial launch detected: opening default explorer in $WORKDIRS_PATH"
    DISPLAY="$DISPLAY_NUM" DBUS_SESSION_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS" \
        runuser -u "$VV_USER" -- \
        /usr/share/codium/codium --no-sandbox --password-store=basic "$WORKDIRS_PATH" > /tmp/codium.log 2>&1 &
    CODIUM_PID=$!
    mkdir -p "$(dirname "$INITIAL_MARKER")"
    touch "$INITIAL_MARKER"
    chown "${VV_USER}:${VV_USER}" "$INITIAL_MARKER" 2>/dev/null || true
else
    echo "[VSCodium] Existing session detected: restoring last active workspace..."
    DISPLAY="$DISPLAY_NUM" DBUS_SESSION_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS" \
        runuser -u "$VV_USER" -- \
        /usr/share/codium/codium --no-sandbox --password-store=basic > /tmp/codium.log 2>&1 &
    CODIUM_PID=$!
fi
echo "[VSCodium] Started with PID $CODIUM_PID."
vv_wait_for_process "codium" 30 "VSCodium main process" || true

# 12. Start FileBrowser Quantum (served via Caddy at /filebrowser/)
echo "[FileBrowser] Starting FileBrowser Quantum..."
mkdir -p "${VV_HOME}/.local/share/filebrowser" "${VV_HOME}/.cache/filebrowser" "$VV_WORKDIRS"
chown -R "${VV_USER}:${VV_USER}" "${VV_HOME}/.local" "${VV_HOME}/.cache" "$VV_WORKDIRS" 2>/dev/null || true
runuser -u "$VV_USER" -- filebrowser -c "${VV_CONFIG}/filebrowser.yaml" > /tmp/filebrowser.log 2>&1 &
FB_PID=$!
vv_wait_for_port 8081 30 "FileBrowser backend" || true
wait_for_http "http://127.0.0.1:8081/filebrowser/" "FileBrowser" 30 "/tmp/filebrowser.log" "$FB_PID"

# Apply FileBrowser branding post-start
if [ -f "$BOOT_DIR/010_filebrowser-branding.sh" ]; then
    if ! bash "$BOOT_DIR/010_filebrowser-branding.sh"; then
        vv_log WARN "010_filebrowser-branding.sh failed, continuing..."
    fi
fi

# 13. Start Caddy reverse proxy
# Ensure backend services are reachable before starting reverse proxy
vv_wait_for_port 8444 30 "KasmVNC backend for Caddy" || true
vv_wait_for_port 8081 30 "FileBrowser backend for Caddy" || true

echo "[Caddy] Starting Caddy reverse proxy..."
caddy run --config "${VV_CONFIG}/Caddyfile" --adapter caddyfile > /tmp/caddy.log 2>&1 &
CADDY_PID=$!
vv_wait_for_port 443 30 "Caddy HTTPS port 443" || true
wait_for_http "https://127.0.0.1:443" "Caddy" 30 "/tmp/caddy.log" "$CADDY_PID" "false"

# 14. Report status & active ports
echo "=========================================================="
echo "    VisualVibe Electron initialized successfully!"
echo "=========================================================="
echo " Active Services:"
echo "   - VisualVibe HTTPS      : https://0.0.0.0:443"
echo "   - VisualVibe HTTP Proxy : http://0.0.0.0:8000"
echo " AI Configuration:"
echo "   - AI_LANG        : ${AI_LANG}"
echo "   - AI_API_URL     : ${AI_API_URL}"
echo "=========================================================="

# 15. Graceful shutdown handler
cleanup() {
    echo ""
    echo "[Shutdown] Caught signal — terminating all VisualVibe services..."
    kill -TERM "$CADDY_PID" "$FB_PID" "$CODIUM_PID" "$VNC_PID" "$OPENBOX_PID" 2>/dev/null || true
    wait "$CADDY_PID" "$FB_PID" 2>/dev/null || true
    echo "[Shutdown] All services stopped cleanly."
    exit 0
}

trap cleanup SIGTERM SIGINT SIGHUP

# 16. Monitor loop: keep container running and supervise core services
# Disable set -e so supervision checks, signals, or process restarts never abort PID 1
set +e

while true; do
    if ! kill -0 "$CADDY_PID" 2>/dev/null; then
        vv_log ERROR "Caddy died unexpectedly! Log output:"
        cat /tmp/caddy.log >&2
        cleanup
    fi
    if ! kill -0 "$FB_PID" 2>/dev/null; then
        vv_log ERROR "FileBrowser died unexpectedly! Log output:"
        cat /tmp/filebrowser.log >&2
        cleanup
    fi
    if [ -n "$VNC_PID" ] && ! kill -0 "$VNC_PID" 2>/dev/null; then
        vv_log ERROR "KasmVNC died unexpectedly! Log output:"
        cat /tmp/kasmvnc.log >&2
        cleanup
    fi
    if [ -n "$OPENBOX_PID" ] && ! kill -0 "$OPENBOX_PID" 2>/dev/null; then
        vv_log ERROR "Openbox died unexpectedly! Log output:"
        cat /tmp/openbox.log >&2
        cleanup
    fi

    # Respawn VSCodium if it ever exits while X11/KasmVNC are running
    if ! kill -0 "$CODIUM_PID" 2>/dev/null && ! pgrep -u "${VV_USER}" -f "codium" >/dev/null 2>&1; then
        vv_log WARN "VSCodium process exited, restarting on display $DISPLAY_NUM..."
        vv_wait_for_display "$DISPLAY_NUM" 10 "KasmVNC display for VSCodium respawn" || true
        DISPLAY="$DISPLAY_NUM" DBUS_SESSION_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS" \
            runuser -u "${VV_USER}" -- \
            /usr/share/codium/codium --no-sandbox --password-store=basic > /tmp/codium.log 2>&1 &
        CODIUM_PID=$!
        vv_wait_for_process "codium" 15 "VSCodium respawned process" || true
    fi

    sleep 2
done
