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

# Print official VisualVibe Electron neon banner on container startup
if [ -f /opt/visualvibe/scripts/print_banner.sh ]; then
    bash /opt/visualvibe/scripts/print_banner.sh
fi

echo "=========================================================="
echo "    Initializing VisualVibe Electron (code-server IDE)"
echo "=========================================================="

# 1. Ensure permissions on /dev/fuse for nested Podman
if [ -e /dev/fuse ]; then
    chmod 666 /dev/fuse 2>/dev/null || true
fi

# 2. Setup home directory and ownership for vvelectron user
mkdir -p /home/vvelectron
# Only fix ownership on the home dir itself — NOT recursively.
# Recursive chown would walk the entire persistent volume on every boot.
chown vvelectron:vvelectron /home/vvelectron

# Ensure the cache dir is owned by vvelectron (avoid EACCES on .cache/Microsoft etc.)
if [ -e /home/vvelectron/.cache ]; then
    chown vvelectron:vvelectron /home/vvelectron/.cache 2>/dev/null || true
fi

# 3. Configure Podman storage for persistent volume
if [ ! -f /home/vvelectron/.config/containers/storage.conf ]; then
    echo "[Init] Configuring Podman storage (fuse-overlayfs)..."
    mkdir -p /home/vvelectron/.config/containers
    cp /opt/visualvibe/config/containers-storage.conf /home/vvelectron/.config/containers/storage.conf
    chown -R vvelectron:vvelectron /home/vvelectron/.config
fi

# Ensure default workspace directory exists in the volume
workdirs="/home/vvelectron/VisualVibe Workdirs"
if [ ! -d "$workdirs" ]; then
    echo "[Init] Creating workspace directory: $workdirs"
    mkdir -p "$workdirs"
fi
# Only fix ownership on the workdir itself — NOT recursively.
chown vvelectron:vvelectron "$workdirs"

# ── Phase 1: apply boot-time patches & configuration (numeric order) ─────────
BOOT_DIR="/opt/visualvibe/scripts/boot"
for script in "$BOOT_DIR"/[0-9][0-9][0-9]_*; do
    [ -f "$script" ] || continue
    # 010_* runs after FileBrowser starts (see service phase below)
    case "$(basename "$script")" in
        010_*) continue ;;
    esac
    echo "── [boot] $(basename "$script")"
    case "$script" in
        *.sh) bash "$script" || echo "[boot] WARN: $(basename "$script") failed (continuing)" ;;
        *.py) python3 "$script" || echo "[boot] WARN: $(basename "$script") failed (continuing)" ;;
    esac
done

# 7. Ensure persistent directories for FileBrowser (db and cache survive restarts)
mkdir -p /home/vvelectron/.local/share/filebrowser
mkdir -p /home/vvelectron/.cache/filebrowser
chown -R vvelectron:vvelectron \
    /home/vvelectron/.local/share/filebrowser \
    /home/vvelectron/.cache/filebrowser

# Helper: active HTTP polling with fail-fast timeout
wait_for_http() {
    local url="$1"
    local label="$2"
    local timeout="${3:-30}"
    local logfile="$4"
    local elapsed=0

    echo "[$label] Waiting for service readiness at $url (timeout: ${timeout}s)..."
    while [ "$elapsed" -lt "$timeout" ]; do
        if curl -fsSo /dev/null "$url" 2>/dev/null; then
            echo "[$label] Service is ready and responding."
            return 0
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

# 8. Start FileBrowser Quantum (127.0.0.1:8081, served via Caddy at /filebrowser/)
echo "[FileBrowser] Starting FileBrowser Quantum on 127.0.0.1:8081..."
runuser -u vvelectron -- filebrowser -c /opt/visualvibe/config/filebrowser.yaml > /tmp/filebrowser.log 2>&1 &
sleep 1
if ! pgrep -u vvelectron -x filebrowser > /dev/null 2>&1; then
    echo "[FileBrowser] FATAL: FileBrowser process did not stay running! Log output:" >&2
    cat /tmp/filebrowser.log 2>/dev/null >&2 || true
    exit 1
else
    echo "[FileBrowser] FileBrowser Quantum is running (PID $(pgrep -u vvelectron -x filebrowser | head -1))."
fi
wait_for_http "http://127.0.0.1:8081/filebrowser/" "FileBrowser" 30 "/tmp/filebrowser.log"

# 8b. Apply VisualVibe branding to FileBrowser (post-start: it regenerates its icons)
bash "$BOOT_DIR/010_filebrowser-branding.sh" || echo "[boot] WARN: 010_filebrowser-branding.sh failed (continuing)"

# 9. Start code-server (127.0.0.1:8080, served via Caddy at /)
echo "[code-server] Starting code-server on 127.0.0.1:8080..."
# Ensure cache dirs are owned by vvelectron before code-server/extension host start
if [ -e /home/vvelectron/.cache ]; then
    chown -R vvelectron:vvelectron /home/vvelectron/.cache 2>/dev/null || true
fi
# Auth mode: if PASSWORD is set and non-empty use password auth, otherwise open (no auth).
if [ -n "${PASSWORD:-}" ]; then
    CS_AUTH="password"
    CS_AUTH_LABEL="Password (set via PASSWORD env var)"
else
    CS_AUTH="none"
    CS_AUTH_LABEL="None (open — secure at perimeter via Cloudflare Access / VPN)"
fi
runuser -u vvelectron -- \
    env PASSWORD="${PASSWORD:-}" \
    code-server \
        --bind-addr 127.0.0.1:8080 \
        --auth "${CS_AUTH}" \
        --disable-telemetry \
        --app-name "VisualVibe Electron" \
    > /tmp/code-server.log 2>&1 &
sleep 2
if ! pgrep -u vvelectron -f "code-server" > /dev/null 2>&1; then
    echo "[code-server] FATAL: code-server process did not stay running! Log output:" >&2
    cat /tmp/code-server.log >&2 || true
    exit 1
else
    echo "[code-server] code-server is running (PID $(pgrep -u vvelectron -f 'node.*code-server' | head -1))."
fi
wait_for_http "http://127.0.0.1:8080/healthz" "code-server" 30 "/tmp/code-server.log"

# 10. Start Caddy reverse proxy (:80 → code-server :8080 + FileBrowser :8081)
echo "[Caddy] Starting Caddy reverse proxy on :80..."
caddy start --config /opt/visualvibe/config/Caddyfile --adapter caddyfile > /tmp/caddy.log 2>&1
sleep 1
if ! pgrep -x caddy > /dev/null 2>&1; then
    echo "[Caddy] FATAL: Caddy failed to start! Log output:" >&2
    cat /tmp/caddy.log >&2 || true
    exit 1
else
    echo "[Caddy] Caddy is running (PID $(pgrep -x caddy | head -1))."
fi
wait_for_http "http://127.0.0.1:80/" "Caddy" 15 "/tmp/caddy.log"

echo "=========================================================="
echo " VisualVibe Electron is ACTIVE and ready!"
echo " Web IDE:       http://<host>/"
echo " File Manager:  http://<host>/filebrowser/"
echo " Auth:          ${CS_AUTH_LABEL}"
echo "=========================================================="

# Graceful shutdown cleanup trap
cleanup() {
    echo "[Shutdown] Terminating services..."
    caddy stop 2>/dev/null || pkill -x caddy 2>/dev/null || true
    pkill -u vvelectron filebrowser 2>/dev/null || true
    # Gracefully stop code-server and WAIT for it to exit, so VS Code flushes
    # state.vscdb (globalState) and the extension host (Zoo Code task history)
    # runs deactivate() before the container is torn down. This avoids losing
    # the last in-flight writes that an immediate SIGKILL would drop.
    pkill -TERM -u vvelectron -f "code-server" 2>/dev/null || true
    for _ in $(seq 1 15); do
        pgrep -u vvelectron -f "code-server" >/dev/null 2>&1 || break
        sleep 1
    done
    pkill -KILL -u vvelectron -f "code-server" 2>/dev/null || true
    exit 0
}

trap cleanup SIGTERM SIGINT SIGQUIT

# Keep container running while code-server is active.
# Use 'sleep N & wait $!' so SIGTERM is delivered immediately to Bash.
while pgrep -u vvelectron -f "code-server" > /dev/null 2>&1; do
    sleep 2 &
    wait $!
done

echo "[Error] code-server terminated unexpectedly."
exit 1
