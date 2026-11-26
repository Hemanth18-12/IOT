#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
BACKEND_DIR="$ROOT_DIR/backend"

check_proc() {
  local name="$1"
  local pid_file="$RUN_DIR/$2.pid"
  local port="$3"

  local pid_state="stopped"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      pid_state="running (PID $pid)"
    else
      pid_state="stale PID file"
    fi
  fi

  local port_state="port $port closed"
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    port_state="port $port listening"
    if [[ "$pid_state" == "stopped" ]]; then
      local ext_pid
      ext_pid="$(lsof -nP -t -iTCP:"$port" -sTCP:LISTEN | head -n 1)"
      pid_state="running externally (PID $ext_pid)"
    fi
  fi

  printf "  %-12s : %s | %s\n" "$name" "$pid_state" "$port_state"
}

echo "=== SmartRoom System Status ==="
check_proc "Mosquitto" "mosquitto" "1883"
check_proc "Backend" "backend" "3000"
check_proc "Frontend" "frontend" "5173"

HEALTH_JSON="$(curl -sf http://127.0.0.1:3000/api/health 2>/dev/null || true)"
if [[ -n "$HEALTH_JSON" ]]; then
  echo "  API Health   : $HEALTH_JSON"
else
  echo "  API Health   : unreachable"
fi

if [[ -f "$BACKEND_DIR/.env" ]]; then
  DB_REL="$(node -e 'const fs=require("fs"); const m=fs.readFileSync(process.argv[1],"utf8").match(/^DB_PATH=(.*)$/m); console.log(m?m[1].trim():"./data/smartroom.sqlite")' "$BACKEND_DIR/.env")"
  (cd "$BACKEND_DIR" && node -e '
    const fs = require("fs");
    const path = require("path");
    const dbFile = path.resolve(process.argv[1]);
    if (!fs.existsSync(dbFile)) {
      console.log("  Database     : file not initialized (" + dbFile + ")");
      process.exit(0);
    }
    const sqlite3 = require("sqlite3");
    const db = new sqlite3.Database(dbFile);
    db.all("SELECT deviceId, name, online, lastSeen FROM devices", (err, devs) => {
      if (err) {
        console.log("  Database     : error (" + err.message + ")");
        process.exit(0);
      }
      db.get("SELECT COUNT(*) AS cnt FROM security_events", (e2, evRow) => {
        console.log("  Database     : SQLite ready (" + (evRow ? evRow.cnt : 0) + " events)");
        if (!devs || devs.length === 0) {
          console.log("  Hardware     : no devices registered");
        } else {
          for (const d of devs) {
            console.log("  Device       : " + d.deviceId + " (" + d.name + ") online=" + Boolean(d.online) + " lastSeen=" + (d.lastSeen || "never"));
          }
        }
        db.close();
      });
    });
  ' "$DB_REL")
fi
