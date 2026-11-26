#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
LOG_DIR="$ROOT_DIR/logs"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
MQTT_CONF="$ROOT_DIR/mqtt/mosquitto.local.conf"

mkdir -p "$RUN_DIR" "$LOG_DIR" "$ROOT_DIR/mqtt/data" "$ROOT_DIR/mqtt/log"

if [[ ! -f "$BACKEND_DIR/.env" || ! -f "$MQTT_CONF" ]]; then
  echo "Project not initialized yet. Running setup first..."
  bash "$SCRIPT_DIR/setup.sh"
fi

is_pid_running() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    rm -f "$pid_file"
  fi
  return 1
}

port_occupied() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

spawn_detached() {
  local cwd="$1"
  local log_file="$2"
  local pid_file="$3"
  local cmd="$4"
  shift 4
  node -e '
    const fs = require("fs");
    const { spawn } = require("child_process");
    const [cwd, logFile, pidFile, cmd, ...args] = process.argv.slice(1);
    const out = fs.openSync(logFile, "a");
    const child = spawn(cmd, args, {
      cwd,
      detached: true,
      stdio: ["ignore", out, out],
    });
    fs.writeFileSync(pidFile, String(child.pid) + "\n");
    child.unref();
  ' "$cwd" "$log_file" "$pid_file" "$cmd" "$@"
}

# 1. Start or reuse Mosquitto
if is_pid_running "$RUN_DIR/mosquitto.pid"; then
  echo "[OK] Mosquitto already running (PID $(cat "$RUN_DIR/mosquitto.pid"))."
elif port_occupied 1883; then
  echo "[WARN] Port 1883 is already in use by an external process; reusing existing broker on port 1883."
else
  echo "[Start] Launching Mosquitto MQTT broker on 0.0.0.0:1883..."
  MOSQ_BIN="$(command -v mosquitto)"
  : > "$LOG_DIR/mosquitto.log"
  spawn_detached "$ROOT_DIR" "$LOG_DIR/mosquitto.log" "$RUN_DIR/mosquitto.pid" \
    "$MOSQ_BIN" -c "$MQTT_CONF" -v
  for _ in $(seq 1 20); do
    if port_occupied 1883; then break; fi
    sleep 0.25
  done
  if ! port_occupied 1883; then
    echo "Error: Mosquitto failed to listen on port 1883. Check $LOG_DIR/mosquitto.log"
    exit 1
  fi
  echo "[OK] Mosquitto listening on port 1883."
fi

# 2. Start or reuse NestJS Backend
if is_pid_running "$RUN_DIR/backend.pid"; then
  echo "[OK] Backend already running (PID $(cat "$RUN_DIR/backend.pid"))."
elif port_occupied 3000; then
  PORT_3000_CMD="$(ps -p "$(lsof -nP -t -iTCP:3000 -sTCP:LISTEN | head -n 1)" -o command= 2>/dev/null || true)"
  if [[ "$PORT_3000_CMD" == *"dist/main"* ]]; then
    echo "[OK] Reusing existing SmartRoom Backend process on port 3000."
  else
    echo "Error: Port 3000 is already occupied by another process ($PORT_3000_CMD)."
    exit 1
  fi
else
  if [[ ! -f "$BACKEND_DIR/dist/main.js" ]]; then
    echo "[Build] Compiling backend..."
    (cd "$BACKEND_DIR" && npm run build)
  fi
  echo "[Start] Launching NestJS Backend on port 3000..."
  NODE_BIN="$(command -v node)"
  : > "$LOG_DIR/backend.log"
  spawn_detached "$BACKEND_DIR" "$LOG_DIR/backend.log" "$RUN_DIR/backend.pid" \
    "$NODE_BIN" dist/main
fi

# Wait for backend health
BACKEND_HEALTH=""
for _ in $(seq 1 30); do
  if BACKEND_HEALTH="$(curl -sf http://127.0.0.1:3000/api/health 2>/dev/null)"; then
    break
  fi
  sleep 0.4
done

if [[ -z "$BACKEND_HEALTH" ]]; then
  echo "Error: Backend health check failed. Inspect $LOG_DIR/backend.log"
  exit 1
fi
echo "[OK] Backend health: $BACKEND_HEALTH"

# 3. Start or reuse Vite Frontend
if is_pid_running "$RUN_DIR/frontend.pid"; then
  echo "[OK] Frontend already running (PID $(cat "$RUN_DIR/frontend.pid"))."
elif port_occupied 5173; then
  PORT_5173_CMD="$(ps -p "$(lsof -nP -t -iTCP:5173 -sTCP:LISTEN | head -n 1)" -o command= 2>/dev/null || true)"
  if [[ "$PORT_5173_CMD" == *"smartroom-iot/frontend"* || "$PORT_5173_CMD" == *"vite"* ]]; then
    echo "[OK] Reusing existing SmartRoom Vite Frontend on port 5173."
  else
    echo "Error: Port 5173 is already occupied by another process ($PORT_5173_CMD)."
    exit 1
  fi
else
  echo "[Start] Launching Vite Frontend on 0.0.0.0:5173..."
  NODE_BIN="$(command -v node)"
  : > "$LOG_DIR/frontend.log"
  spawn_detached "$FRONTEND_DIR" "$LOG_DIR/frontend.log" "$RUN_DIR/frontend.pid" \
    "$NODE_BIN" ./node_modules/vite/bin/vite.js --host 0.0.0.0 --port 5173
  for _ in $(seq 1 25); do
    if curl -sf http://127.0.0.1:5173 >/dev/null 2>&1; then
      break
    fi
    sleep 0.3
  done
  if ! curl -sf http://127.0.0.1:5173 >/dev/null 2>&1; then
    echo "Error: Frontend failed to start on port 5173. Inspect $LOG_DIR/frontend.log"
    exit 1
  fi
  echo "[OK] Frontend listening on port 5173."
fi

LAN_IP=""
for iface in en0 en1 en2; do
  LAN_IP="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
  if [[ -n "$LAN_IP" ]]; then break; fi
done
if [[ -z "$LAN_IP" ]]; then
  LAN_IP="$(ifconfig | awk '/inet / && $2 != "127.0.0.1" {print $2; exit}' || true)"
fi

SMTP_STATUS="placeholders set (configure backend/.env)"
if [[ -f "$BACKEND_DIR/.env" ]]; then
  SMTP_STATUS="$(node -e '
    const fs = require("fs");
    const txt = fs.readFileSync(process.argv[1], "utf8");
    const get = (k) => (txt.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim() || "";
    const u = get("SMTP_USER"), p = get("SMTP_PASS");
    const isPh = (v) => !v || /my_gmail|my_google_app|your-email|your-google-app/i.test(v);
    console.log(isPh(u) || isPh(p) ? "placeholders set (configure backend/.env)" : "configured (" + u + ")");
  ' "$BACKEND_DIR/.env")"
fi

HW_STATUS="smartroom-01 offline (waiting for NodeMCU)"
if command -v arduino-cli >/dev/null 2>&1; then
  USB_PORT="$(arduino-cli board list 2>/dev/null | awk 'NR>1 && !/Bluetooth|debug-console/ && (/usb|ACM|ttyUSB|arduino|esp|cp210|ch340|ftdi/i) {print $1; exit}' || true)"
  if [[ -n "$USB_PORT" ]]; then
    HW_STATUS="$HW_STATUS | USB port detected: $USB_PORT"
  fi
fi

echo
echo "=========================================="
echo "         SMARTROOM SYSTEM READY"
echo "=========================================="
echo "  Website URL        : http://localhost:5173"
if [[ -n "$LAN_IP" ]]; then
  MOBILE_URL="http://$LAN_IP:5173"
  echo "  Mobile URL         : $MOBILE_URL"
  echo "  NodeMCU MQTT IP    : $LAN_IP (port 1883)"
else
  MOBILE_URL="http://localhost:5173"
fi
echo "  Backend Status     : running on port 3000 (Swagger: http://localhost:3000/api/docs)"
echo "  MQTT Status        : connected to Mosquitto on port 1883"
echo "  Database Status    : SQLite connected"
echo "  Hardware Status    : $HW_STATUS"
echo "  Email Config Status: $SMTP_STATUS"
echo "  Logs Directory     : $LOG_DIR/"
echo "  Admin Credentials  : Check ADMIN_EMAIL / ADMIN_PASSWORD in backend/.env"
echo "  Stop All           : npm run stop"

if [[ -n "$LAN_IP" && -d "$ROOT_DIR/node_modules/qrcode-terminal" ]]; then
  echo
  echo "Scan with mobile phone on same Wi-Fi ($MOBILE_URL):"
  node -e 'require("qrcode-terminal").generate(process.argv[1], { small: true });' "$MOBILE_URL"
fi
