#!/bin/bash
# 012_fix-extension-ownership.sh — boot — ensure the Zoo Code + custom VisualVibe
# extensions (patched as root by 003/011) are owned by vvelectron on the persistent
# volume, so code-server (which runs as vvelectron) can read/write them (idempotent).
set -e
chown -R vvelectron:vvelectron /home/vvelectron/.local/share/code-server/extensions 2>/dev/null || true
