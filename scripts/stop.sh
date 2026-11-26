#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"

stop_service() {
  local name="$1"
  local pid_file="$RUN_DIR/$2.pid"
  if [[ ! -f "$pid_file" ]]; then
    echo "[SKIP] $name: no PID file found."
    return
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -z "$pid" ]]; then
    rm -f "$pid_file"
    echo "[SKIP] $name: empty PID file removed."
    return
  fi

  if kill -0 "$pid" 2>/dev/null; then
    echo "[Stop] Stopping $name (PID $pid)..."
    kill -TERM "$pid" 2>/dev/null || true
    for _ in $(seq 1 15); do
      if ! kill -0 "$pid" 2>/dev/null; then break; fi
      sleep 0.2
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
    echo "[OK] $name stopped."
  else
    echo "[CLEAN] $name was not running (stale PID $pid removed)."
  fi
  rm -f "$pid_file"
}

stop_service "Frontend" "frontend"
stop_service "Backend" "backend"
stop_service "Mosquitto" "mosquitto"
