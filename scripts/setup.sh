#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
MQTT_DIR="$ROOT_DIR/mqtt"

echo "=== SmartRoom IoT Setup ==="

# 1. Check required dependencies
for cmd in node npm mosquitto mosquitto_passwd; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: '$cmd' is not installed or not in PATH."
    exit 1
  fi
done
echo "[OK] Node $(node -v), npm $(npm -v), mosquitto $(mosquitto -h 2>&1 | awk '/version/ {print $3; exit}' || echo 'installed')"

# 2. Install backend & frontend dependencies if needed
if [[ ! -d "$BACKEND_DIR/node_modules" || "${1:-}" == "--force" ]]; then
  echo "[Setup] Installing backend dependencies..."
  (cd "$BACKEND_DIR" && npm install)
else
  echo "[OK] Backend dependencies already installed."
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" || "${1:-}" == "--force" ]]; then
  echo "[Setup] Installing frontend dependencies..."
  (cd "$FRONTEND_DIR" && npm install)
else
  echo "[OK] Frontend dependencies already installed."
fi

# 3. Detect LAN IP safely
LAN_IP=""
for iface in en0 en1 en2; do
  LAN_IP="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
  if [[ -n "$LAN_IP" ]]; then break; fi
done
if [[ -z "$LAN_IP" ]]; then
  LAN_IP="$(ifconfig | awk '/inet / && $2 != "127.0.0.1" {print $2; exit}' || true)"
fi

# 4. Create missing environment files without overwriting existing secrets
if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  echo "[Setup] Creating backend/.env with generated local secrets..."
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"

  GEN_JWT="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  GEN_ADMIN_PASS="$(node -e "console.log('SR-' + require('crypto').randomBytes(9).toString('base64url'))")"
  GEN_MQTT_BACKEND_PASS="$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")"
  GEN_MQTT_DEVICE_PASS="$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")"
  GEN_MQTT_SIM_PASS="$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")"

  CORS_LIST="http://localhost:5173,http://127.0.0.1:5173"
  if [[ -n "$LAN_IP" ]]; then
    CORS_LIST="$CORS_LIST,http://$LAN_IP:5173"
  fi

  node -e '
    const fs = require("fs");
    const envPath = process.argv[1];
    let txt = fs.readFileSync(envPath, "utf8");
    const setVar = (k, v) => {
      const re = new RegExp("^" + k + "=.*$", "m");
      if (re.test(txt)) txt = txt.replace(re, k + "=" + v);
      else txt += "\n" + k + "=" + v;
    };
    setVar("CORS_ORIGINS", process.argv[2]);
    setVar("JWT_SECRET", process.argv[3]);
    setVar("ADMIN_PASSWORD", process.argv[4]);
    setVar("MQTT_BROKER_URL", "mqtt://127.0.0.1:1883");
    setVar("MQTT_PASSWORD", process.argv[5]);
    setVar("MQTT_DEVICE_PASSWORD", process.argv[6]);
    setVar("MQTT_SIM_PASSWORD", process.argv[7]);
    fs.writeFileSync(envPath, txt);
  ' "$BACKEND_DIR/.env" "$CORS_LIST" "$GEN_JWT" "$GEN_ADMIN_PASS" "$GEN_MQTT_BACKEND_PASS" "$GEN_MQTT_DEVICE_PASS" "$GEN_MQTT_SIM_PASS"

  chmod 600 "$BACKEND_DIR/.env"
  echo "[OK] Created backend/.env (secrets stored securely inside backend/.env and excluded from Git)."
else
  echo "[OK] Preserved existing backend/.env"
fi

if [[ ! -f "$FRONTEND_DIR/.env" ]]; then
  cp "$FRONTEND_DIR/.env.example" "$FRONTEND_DIR/.env"
  echo "[OK] Created frontend/.env"
else
  echo "[OK] Preserved existing frontend/.env"
fi

# 5. Configure Mosquitto passwords & local config if missing
if [[ ! -f "$MQTT_DIR/passwords" || ! -f "$MQTT_DIR/mosquitto.local.conf" ]]; then
  echo "[Setup] Initializing local Mosquitto credentials and configuration..."
  MQTT_BACKEND_PASS="$(node -e 'const fs=require("fs"); const m=fs.readFileSync(process.argv[1],"utf8").match(/^MQTT_PASSWORD=(.*)$/m); console.log(m?m[1].trim():"")' "$BACKEND_DIR/.env")"
  MQTT_DEVICE_PASS="$(node -e 'const fs=require("fs"); const m=fs.readFileSync(process.argv[1],"utf8").match(/^MQTT_DEVICE_PASSWORD=(.*)$/m); console.log(m?m[1].trim():"")' "$BACKEND_DIR/.env")"
  MQTT_SIM_PASS="$(node -e 'const fs=require("fs"); const m=fs.readFileSync(process.argv[1],"utf8").match(/^MQTT_SIM_PASSWORD=(.*)$/m); console.log(m?m[1].trim():"")' "$BACKEND_DIR/.env")"

  if [[ -z "$MQTT_BACKEND_PASS" || "$MQTT_BACKEND_PASS" == replace-with-* ]]; then
    MQTT_BACKEND_PASS="$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")"
  fi
  if [[ -z "$MQTT_DEVICE_PASS" ]]; then
    MQTT_DEVICE_PASS="$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")"
  fi
  if [[ -z "$MQTT_SIM_PASS" ]]; then
    MQTT_SIM_PASS="$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")"
  fi

  MQTT_BACKEND_PASS="$MQTT_BACKEND_PASS" \
  MQTT_DEVICE_PASS="$MQTT_DEVICE_PASS" \
  MQTT_SIM_PASS="$MQTT_SIM_PASS" \
  bash "$SCRIPT_DIR/setup-mqtt.sh" --from-env
else
  echo "[OK] Preserved existing Mosquitto configuration."
fi

# 5b. Generate gitignored firmware secrets.h if missing (never overwrites user Wi-Fi creds)
SECRETS_H="$ROOT_DIR/firmware/esp8266/smartroom_esp8266/secrets.h"
if [[ ! -f "$SECRETS_H" ]]; then
  MQTT_DEV_PASS_CUR="$(node -e 'const fs=require("fs"); const m=fs.readFileSync(process.argv[1],"utf8").match(/^MQTT_DEVICE_PASSWORD=(.*)$/m); console.log(m?m[1].trim():"YOUR_MQTT_DEVICE_PASSWORD")' "$BACKEND_DIR/.env")"
  BROKER_LAN_IP="${LAN_IP:-10.247.220.74}"
  cat > "$SECRETS_H" <<EOF
// Local NodeMCU credentials (gitignored). Fill in your 2.4 GHz Wi-Fi SSID & password before flashing.
#pragma once

#define WIFI_SSID        "YOUR_WIFI_SSID"
#define WIFI_PASSWORD    "YOUR_WIFI_PASSWORD"
#define MQTT_BROKER_IP   "$BROKER_LAN_IP"
#define MQTT_PORT        1883
#define MQTT_USERNAME    "smartroom_device"
#define MQTT_PASSWORD    "$MQTT_DEV_PASS_CUR"
#define DEVICE_ID        "smartroom-01"
EOF
  chmod 600 "$SECRETS_H"
  echo "[OK] Generated firmware/esp8266/smartroom_esp8266/secrets.h (MQTT credentials pre-populated; add Wi-Fi SSID/password before upload)."
else
  echo "[OK] Preserved existing firmware/esp8266/smartroom_esp8266/secrets.h"
fi

# 6. Build backend & run SQLite migrations + idempotent admin seed
echo "[Setup] Building backend..."
(cd "$BACKEND_DIR" && npm run build)

echo "[Setup] Running SQLite database migrations and seeding admin account..."
(cd "$BACKEND_DIR" && npm run migration:run && npm run seed:admin)

# 7. Verify all 9 SQLite tables exist
DB_REL_PATH="$(node -e 'const fs=require("fs"); const m=fs.readFileSync(process.argv[1],"utf8").match(/^DB_PATH=(.*)$/m); console.log(m?m[1].trim():"./data/smartroom.sqlite")' "$BACKEND_DIR/.env")"
(cd "$BACKEND_DIR" && node -e '
  const sqlite3 = require("sqlite3");
  const db = new sqlite3.Database(process.argv[1]);
  const expected = ["users","devices","device_states","telemetry","security_events","notifications","email_logs","settings","commands"];
  db.all("SELECT name FROM sqlite_master WHERE type=\x27table\x27", (err, rows) => {
    if (err) { console.error(err); process.exit(1); }
    const names = new Set(rows.map(r => r.name));
    const missing = expected.filter(t => !names.has(t));
    if (missing.length) {
      console.error("Missing SQLite tables:", missing.join(", "));
      process.exit(1);
    }
    console.log("[OK] Verified all 9 SQLite tables exist.");
    db.close();
  });
' "$DB_REL_PATH")

echo "=== Setup Complete ==="
echo "Run 'npm run dev' (or './scripts/start.sh') to launch Mosquitto, Backend, and Frontend."
