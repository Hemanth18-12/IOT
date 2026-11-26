#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MQTT_DIR="$ROOT_DIR/mqtt"
PASS_FILE="$MQTT_DIR/passwords"
LOCAL_CONF="$MQTT_DIR/mosquitto.local.conf"

if ! command -v mosquitto_passwd >/dev/null 2>&1; then
  echo "Error: mosquitto_passwd not found. Install Mosquitto first (e.g., brew install mosquitto)."
  exit 1
fi

mkdir -p "$MQTT_DIR/data" "$MQTT_DIR/log"
chmod 755 "$MQTT_DIR/data" "$MQTT_DIR/log"

if [[ "${1:-}" == "--from-env" ]]; then
  if [[ -z "${MQTT_BACKEND_PASS:-}" || -z "${MQTT_DEVICE_PASS:-}" || -z "${MQTT_SIM_PASS:-}" ]]; then
    echo "Error: MQTT_BACKEND_PASS, MQTT_DEVICE_PASS, and MQTT_SIM_PASS must be set with --from-env."
    exit 1
  fi
  BACKEND_PASS="$MQTT_BACKEND_PASS"
  DEVICE_PASS="$MQTT_DEVICE_PASS"
  SIM_PASS="$MQTT_SIM_PASS"
else
  read -r -s -p "Enter password for MQTT user 'smartroom_backend': " BACKEND_PASS
  echo
  read -r -s -p "Enter password for MQTT user 'smartroom_device': " DEVICE_PASS
  echo
  read -r -s -p "Enter password for MQTT user 'smartroom_simulator': " SIM_PASS
  echo
fi

if [[ -z "$BACKEND_PASS" || -z "$DEVICE_PASS" || -z "$SIM_PASS" ]]; then
  echo "Error: MQTT passwords cannot be empty."
  exit 1
fi

mosquitto_passwd -c -b "$PASS_FILE" smartroom_backend "$BACKEND_PASS"
mosquitto_passwd -b "$PASS_FILE" smartroom_device "$DEVICE_PASS"
mosquitto_passwd -b "$PASS_FILE" smartroom_simulator "$SIM_PASS"
chmod 600 "$PASS_FILE"

cat > "$LOCAL_CONF" <<EOF
# Auto-generated local macOS/Linux Mosquitto configuration
# Do not commit this file (listed in .gitignore).
persistence true
persistence_location $MQTT_DIR/data/
log_dest file $MQTT_DIR/log/mosquitto.log
log_type error
log_type warning
log_type notice
log_type information

listener 1883 0.0.0.0
allow_anonymous false
password_file $PASS_FILE
acl_file $MQTT_DIR/acl.conf
EOF

echo "Configured Mosquitto credentials and local config at $LOCAL_CONF"
