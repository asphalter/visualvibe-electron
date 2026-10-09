#!/bin/bash
# common.sh — shared shell helpers for VisualVibe Electron scripts.
# Source this file to get consistent logging across numbered scripts.

# vv_log <tag> <message...> — emit a consistent log line like "[tag] message"
vv_log() {
    local tag="${1:-Init}"
    shift
    echo "[$tag] $*"
}
