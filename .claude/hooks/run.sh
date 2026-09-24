#!/usr/bin/env bash
# Locates node (not on PATH on this machine) and runs the PostToolUse check.
# Resolves its own directory rather than trusting cwd or CLAUDE_PROJECT_DIR,
# which on Windows may hold a backslash path bash cannot cd into.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE" ]; then
  for c in "/c/Program Files/nodejs/node.exe" "/c/Program Files (x86)/nodejs/node.exe"; do
    if [ -x "$c" ]; then NODE="$c"; break; fi
  done
fi
# A missing toolchain must never fail the edit that triggered the hook.
[ -z "$NODE" ] && exit 0
exec "$NODE" "$HERE/check.mjs"
