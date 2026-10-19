#!/bin/bash
# common.sh — shared shell helpers & paths for VisualVibe Electron scripts.
# Source this file to get consistent logging & centralized paths across scripts.

# ── Centralized paths & environment constants ─────────────────────────────────
export VV_USER="${VV_USER:-vvelectron}"
export VV_HOME="${VV_HOME:-/home/${VV_USER}}"
export VV_BASE="${VV_BASE:-/opt/visualvibe}"
export VV_WORKDIRS="${VV_WORKDIRS:-${VV_HOME}/VisualVibe Workdirs}"
export KASMVNC_WWW_DIR="${KASMVNC_WWW_DIR:-/usr/share/kasmvnc/www}"
export VSCODIUM_DATA="${VSCODIUM_DATA:-${VV_HOME}/.vscode-oss}"
export VSCODIUM_EXTENSIONS="${VSCODIUM_EXTENSIONS:-${VSCODIUM_DATA}/extensions}"
export VSCODIUM_CONFIG="${VSCODIUM_CONFIG:-${VV_HOME}/.config/VSCodium}"
export VSCODIUM_USER_DIR="${VSCODIUM_USER_DIR:-${VSCODIUM_CONFIG}/User}"
export VV_CONFIG="${VV_CONFIG:-${VV_BASE}/config}"
export VV_MEDIA="${VV_MEDIA:-${VV_BASE}/media}"
export VV_EXTENSIONS="${VV_EXTENSIONS:-${VV_BASE}/extensions}"
export VV_SCRIPTS="${VV_SCRIPTS:-${VV_BASE}/scripts}"
export VV_BOOT_DIR="${VV_BOOT_DIR:-${VV_SCRIPTS}/boot}"
export VV_BUILD_DIR="${VV_BUILD_DIR:-${VV_SCRIPTS}/build}"
export VV_LIB_DIR="${VV_LIB_DIR:-${VV_SCRIPTS}/lib}"

# ── Error handling & structured logging ───────────────────────────────────────

# vv_log <level> <message...> — emit standardized log (INFO/DEBUG to stdout, WARN/ERROR to stderr):
# [VV-<LEVEL>] <timestamp> <nome_script>: <messaggio>
vv_log() {
    local level="INFO"
    case "${1:-}" in
        INFO|WARN|ERROR|DEBUG)
            level="$1"
            shift
            ;;
    esac
    local script_name="${BASH_SOURCE[1]:-${0##*/}}"
    script_name="${script_name##*/}"
    local ts
    ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%S%z")"
    case "${level}" in
        WARN|ERROR)
            echo "[VV-${level}] ${ts} ${script_name}: $*" >&2
            ;;
        *)
            echo "[VV-${level}] ${ts} ${script_name}: $*"
            ;;
    esac
}

# vv_trap_err <lineno> <command> <exitcode> — error trap handler
vv_trap_err() {
    local line="${1:-unknown}"
    local cmd="${2:-unknown}"
    local code="${3:-1}"
    local script_name="${BASH_SOURCE[1]:-${0##*/}}"
    script_name="${script_name##*/}"
    local ts
    ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%S%z")"
    echo "[VV-ERROR] ${ts} ${script_name}:${line} — comando \"${cmd}\" fallito con exit code ${code}" >&2
}

# vv_init_strict — enable strict shell mode and ERR trap
vv_init_strict() {
    set -euo pipefail
    trap 'vv_trap_err $LINENO "$BASH_COMMAND" $?' ERR
}

# ── Health-check & Service Readiness Functions ────────────────────────────────

# vv_wait_for_file <file_path> [timeout_sec] [description]
# Polls until the given file, socket, or directory exists.
# Defaults: timeout 30s. Returns 0 if found, 1 on timeout.
vv_wait_for_file() {
    local target="$1"
    local timeout="${2:-30}"
    local desc="${3:-$target}"
    local elapsed=0
    local interval="${VV_POLL_INTERVAL:-1}"

    vv_log INFO "Waiting for file: ${desc} (timeout: ${timeout}s)..."
    while [ "$elapsed" -lt "$timeout" ]; do
        if [ -e "$target" ] || [ -S "$target" ]; then
            vv_log INFO "Ready: ${desc} (available after ${elapsed}s)"
            return 0
        fi
        sleep "$interval"
        elapsed=$((elapsed + interval))
    done

    if [ -e "$target" ] || [ -S "$target" ]; then
        vv_log INFO "Ready: ${desc} (available after ${elapsed}s)"
        return 0
    fi

    vv_log WARN "Timeout waiting for file: ${desc} after ${timeout}s (continuing anyway)"
    return 1
}

# vv_wait_for_port <port> [timeout_sec] [description]
# Polls until the specified TCP port is accepting connections on localhost.
# Uses /dev/tcp, ss -tln, nc -z, or python3 socket.
# Defaults: timeout 30s. Returns 0 if open, 1 on timeout.
vv_wait_for_port() {
    local port="$1"
    local timeout="${2:-30}"
    local desc="${3:-port ${port}}"
    local elapsed=0
    local interval="${VV_POLL_INTERVAL:-1}"

    vv_log INFO "Waiting for port: ${desc} (timeout: ${timeout}s)..."
    while [ "$elapsed" -lt "$timeout" ]; do
        # 1. Check with bash /dev/tcp
        if (timeout 1 bash -c "echo >/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
            vv_log INFO "Ready: ${desc} is open (after ${elapsed}s)"
            return 0
        fi
        # 2. Check with ss if available
        if command -v ss >/dev/null 2>&1; then
            if ss -tln 2>/dev/null | grep -qE "[:.]${port}[[:space:]]"; then
                vv_log INFO "Ready: ${desc} is open (after ${elapsed}s)"
                return 0
            fi
        fi
        # 3. Check with nc if available
        if command -v nc >/dev/null 2>&1; then
            if nc -z 127.0.0.1 "$port" 2>/dev/null; then
                vv_log INFO "Ready: ${desc} is open (after ${elapsed}s)"
                return 0
            fi
        fi
        # 4. Check with python3 if available
        if command -v python3 >/dev/null 2>&1; then
            if python3 -c "import socket; s = socket.socket(); s.settimeout(0.5); s.connect(('127.0.0.1', int('${port}'))); s.close()" 2>/dev/null; then
                vv_log INFO "Ready: ${desc} is open (after ${elapsed}s)"
                return 0
            fi
        fi
        sleep "$interval"
        elapsed=$((elapsed + interval))
    done

    # Final check
    if (timeout 1 bash -c "echo >/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
        vv_log INFO "Ready: ${desc} is open (after ${elapsed}s)"
        return 0
    fi

    vv_log WARN "Timeout waiting for port: ${desc} after ${timeout}s (continuing anyway)"
    return 1
}

# vv_wait_for_process <process_name> [timeout_sec] [description]
# Polls until a process matching process_name is running.
# Uses pgrep / pidof.
# Defaults: timeout 30s. Returns 0 if running, 1 on timeout.
vv_wait_for_process() {
    local proc_name="$1"
    local timeout="${2:-30}"
    local desc="${3:-process ${proc_name}}"
    local elapsed=0
    local interval="${VV_POLL_INTERVAL:-1}"

    vv_log INFO "Waiting for process: ${desc} (timeout: ${timeout}s)..."
    while [ "$elapsed" -lt "$timeout" ]; do
        if pgrep -x "$proc_name" >/dev/null 2>&1 || pgrep "$proc_name" >/dev/null 2>&1; then
            vv_log INFO "Ready: ${desc} is running (after ${elapsed}s)"
            return 0
        fi
        if command -v pidof >/dev/null 2>&1 && pidof "$proc_name" >/dev/null 2>&1; then
            vv_log INFO "Ready: ${desc} is running (after ${elapsed}s)"
            return 0
        fi
        sleep "$interval"
        elapsed=$((elapsed + interval))
    done

    # Final check
    if pgrep -x "$proc_name" >/dev/null 2>&1 || pgrep "$proc_name" >/dev/null 2>&1; then
        vv_log INFO "Ready: ${desc} is running (after ${elapsed}s)"
        return 0
    fi
    if command -v pidof >/dev/null 2>&1 && pidof "$proc_name" >/dev/null 2>&1; then
        vv_log INFO "Ready: ${desc} is running (after ${elapsed}s)"
        return 0
    fi

    vv_log WARN "Timeout waiting for process: ${desc} after ${timeout}s (continuing anyway)"
    return 1
}

# vv_display_is_ready <display> <socket_path>
# Verifies whether the X11 display is ready.
# Returns: 0 = accepting connections, 1 = not ready, 2 = socket exists but no
# xdpyinfo/xprop validator is available.
vv_display_is_ready() {
    local display="$1"
    local socket_path="$2"
    local xauth=""
    local err

    if [ ! -S "$socket_path" ] && [ ! -e "$socket_path" ]; then
        return 1
    fi

    # KasmVNC/Xvnc runs as VV_USER and writes its X authority cookie under
    # VV_HOME/.Xauthority. When this helper runs as root (entrypoint), the
    # default root cookie is missing and xdpyinfo/xprop would fail with an
    # authorization error even though the display is actually ready.
    if [ -n "${VV_USER:-}" ] && [ -r "${VV_HOME:-}/.Xauthority" ]; then
        xauth="${VV_HOME}/.Xauthority"
    fi

    if command -v xdpyinfo >/dev/null 2>&1; then
        if [ -n "$xauth" ]; then
            if XAUTHORITY="$xauth" xdpyinfo -display "$display" >/dev/null 2>&1; then
                return 0
            fi
            err="$(XAUTHORITY="$xauth" xdpyinfo -display "$display" 2>&1 || true)"
        else
            if xdpyinfo -display "$display" >/dev/null 2>&1; then
                return 0
            fi
            err="$(xdpyinfo -display "$display" 2>&1 || true)"
        fi
        vv_log DEBUG "Display ${display}: xdpyinfo failed: ${err}"
        return 1
    fi
    if command -v xprop >/dev/null 2>&1; then
        if [ -n "$xauth" ]; then
            if XAUTHORITY="$xauth" DISPLAY="$display" xprop -root >/dev/null 2>&1; then
                return 0
            fi
            err="$(XAUTHORITY="$xauth" DISPLAY="$display" xprop -root 2>&1 || true)"
        else
            if DISPLAY="$display" xprop -root >/dev/null 2>&1; then
                return 0
            fi
            err="$(DISPLAY="$display" xprop -root 2>&1 || true)"
        fi
        vv_log DEBUG "Display ${display}: xprop failed: ${err}"
        return 1
    fi
    return 2
}

# vv_wait_for_display [display] [timeout_sec] [description]
# Polls until the X11 display is ready and accepting connections.
# Defaults: display :1, timeout 30s. Returns 0 if ready, 1 on timeout.
vv_wait_for_display() {
    local display="${1:-:1}"
    local timeout="${2:-30}"
    local desc="${3:-X display ${display}}"
    local elapsed=0
    local interval="${VV_POLL_INTERVAL:-1}"
    local rc
    local diag_logged=0

    # Extract display number (:1 -> 1, :1.0 -> 1)
    local disp_num="${display#:}"
    disp_num="${disp_num%%.*}"
    local socket_path="/tmp/.X11-unix/X${disp_num}"

    vv_log INFO "Waiting for X display: ${desc} (socket ${socket_path}, timeout: ${timeout}s)..."
    while [ "$elapsed" -lt "$timeout" ]; do
        if vv_display_is_ready "$display" "$socket_path"; then
            vv_log INFO "Ready: ${desc} is accepting connections (after ${elapsed}s)"
            return 0
        else
            rc=$?
            if [ "$rc" -eq 2 ]; then
                vv_log INFO "Ready: ${desc} socket exists (after ${elapsed}s)"
                return 0
            elif [ "$diag_logged" -eq 0 ]; then
                diag_logged=1
                if [ -S "$socket_path" ] || [ -e "$socket_path" ]; then
                    vv_log WARN "Display ${display}: socket present but not accepting X connections yet; Xvnc procs: [$(pgrep -x Xvnc 2>/dev/null | tr '\n' ' ')]"
                else
                    vv_log DEBUG "Display ${display}: socket ${socket_path} not present yet; Xvnc procs: [$(pgrep -x Xvnc 2>/dev/null | tr '\n' ' ')]"
                fi
            fi
        fi
        sleep "$interval"
        elapsed=$((elapsed + interval))
    done

    # Final post-poll check to cover the last polling window; it still requires
    # the same validation and never reports "Ready" based on the socket alone
    # unless no xdpyinfo/xprop validator is installed.
    if vv_display_is_ready "$display" "$socket_path"; then
        vv_log INFO "Ready: ${desc} is accepting connections (after ${elapsed}s)"
        return 0
    else
        rc=$?
        if [ "$rc" -eq 2 ]; then
            vv_log INFO "Ready: ${desc} socket exists (after ${elapsed}s)"
            return 0
        fi
    fi

    vv_log WARN "Timeout waiting for X display: ${desc} after ${timeout}s (continuing anyway)"
    return 1
}

export -f vv_log
export -f vv_trap_err
export -f vv_init_strict
export -f vv_wait_for_file
export -f vv_wait_for_port
export -f vv_wait_for_process
export -f vv_wait_for_display
