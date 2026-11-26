#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:$PATH"

echo "=== Arduino CLI Board Enumeration ==="
if command -v arduino-cli >/dev/null 2>&1; then
  arduino-cli board list || true
else
  echo "arduino-cli not installed."
fi

echo
echo "=== macOS Serial Device Nodes (/dev/cu.*) ==="
ls -la /dev/cu.* 2>/dev/null || echo "No serial ports detected."
