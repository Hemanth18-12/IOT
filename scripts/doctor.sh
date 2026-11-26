#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:$PATH"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

echo "=== SmartRoom System Doctor ==="

# 1. Core Dependencies
for cmd in node npm mosquitto mosquitto_passwd arduino-cli python3; do
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "  [OK] $cmd -> $(command -v "$cmd")"
  else
    echo "  [WARN] $cmd not found in PATH"
  fi
done

# 2. LAN IP
LAN_IP=""
for iface in en0 en1 en2; do
  LAN_IP="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
  if [[ -n "$LAN_IP" ]]; then break; fi
done
echo "  [INFO] Detected LAN IP: ${LAN_IP:-unavailable}"

# 3. Arduino CLI Cores & Libraries
if command -v arduino-cli >/dev/null 2>&1; then
  echo "  [INFO] Arduino cores:"
  arduino-cli core list | awk 'NR>1 && NF>0 {print "    - " $1 " (" $2 ")"}'
  echo "  [INFO] Connected serial devices:"
  arduino-cli board list | awk 'NR>1 && NF>0 {print "    - " $0}'
fi

# 4. Python Venv
if [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
  PY_PKGS="$("$ROOT_DIR/.venv/bin/python" -c "import cv2, serial, numpy; print('cv2=' + cv2.__version__ + ', numpy=' + numpy.__version__)" 2>&1 || true)"
  echo "  [OK] Python .venv: $PY_PKGS"
else
  echo "  [WARN] Python .venv missing at $ROOT_DIR/.venv"
fi

# 5. Env & Secrets Files
[[ -f "$BACKEND_DIR/.env" ]] && echo "  [OK] backend/.env present" || echo "  [ERR] backend/.env missing"
[[ -f "$FRONTEND_DIR/.env" ]] && echo "  [OK] frontend/.env present" || echo "  [ERR] frontend/.env missing"
[[ -f "$ROOT_DIR/mqtt/passwords" ]] && echo "  [OK] mqtt/passwords present" || echo "  [ERR] mqtt/passwords missing"
[[ -f "$ROOT_DIR/firmware/esp8266/smartroom_esp8266/secrets.h" ]] && echo "  [OK] firmware secrets.h present" || echo "  [WARN] firmware secrets.h missing"

# 6. Running Services & Health
lsof -nP -iTCP:1883 -sTCP:LISTEN >/dev/null 2>&1 && echo "  [OK] Mosquitto port 1883 listening" || echo "  [WARN] Mosquitto port 1883 not listening"
lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1 && echo "  [OK] Backend port 3000 listening" || echo "  [WARN] Backend port 3000 not listening"
lsof -nP -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1 && echo "  [OK] Frontend port 5173 listening" || echo "  [WARN] Frontend port 5173 not listening"

HEALTH="$(curl -sf http://127.0.0.1:3000/api/health 2>/dev/null || true)"
if [[ -n "$HEALTH" ]]; then
  echo "  [OK] API Health: $HEALTH"
else
  echo "  [WARN] API Health unreachable"
fi

# 7. Check SMTP placeholder status safely (never prints credentials)
if [[ -f "$BACKEND_DIR/.env" ]]; then
  node -e '
    const fs = require("fs");
    const txt = fs.readFileSync(process.argv[1], "utf8");
    const get = (k) => (txt.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim() || "";
    const u = get("SMTP_USER");
    const p = get("SMTP_PASS");
    const isPh = (v) => !v || /my_gmail|my_google_app|your-email|your-google-app/i.test(v);
    console.log("  [" + (isPh(u) || isPh(p) ? "WARN" : "OK") + "] Gmail SMTP:", isPh(u) || isPh(p) ? "placeholders set (configure in backend/.env for live emails)" : "configured for " + u);
  ' "$BACKEND_DIR/.env"
fi
