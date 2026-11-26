#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:$PATH"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! command -v arduino-cli >/dev/null 2>&1; then
  echo "Error: arduino-cli not found. Install with: brew install arduino-cli"
  exit 1
fi

echo "=== Compiling SmartRoom Arduino & NodeMCU Sketches ==="
echo "[1/7] Arduino Uno Production Firmware..."
arduino-cli compile --fqbn arduino:avr:uno "$ROOT_DIR/firmware/arduino/smartroom_arduino"

echo "[2/7] NodeMCU ESP8266 Production Firmware..."
arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 "$ROOT_DIR/firmware/esp8266/smartroom_esp8266"

echo "[3/7] Diagnostic: Arduino Serial TX Test..."
arduino-cli compile --fqbn arduino:avr:uno "$ROOT_DIR/firmware/diagnostics/arduino_serial_tx_test"

echo "[4/7] Diagnostic: NodeMCU Serial RX Test..."
arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 "$ROOT_DIR/firmware/diagnostics/nodemcu_serial_rx_test"

echo "[5/7] Diagnostic: NodeMCU Buzzer Test (Active-HIGH / Active-LOW / Passive PWM)..."
arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 "$ROOT_DIR/firmware/diagnostics/nodemcu_buzzer_test"

echo "[6/7] Diagnostic: Two-Way Serial (Arduino side)..."
arduino-cli compile --fqbn arduino:avr:uno "$ROOT_DIR/firmware/diagnostics/two_way_serial_test/two_way_arduino"

echo "[7/7] Diagnostic: Two-Way Serial (NodeMCU side)..."
arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 "$ROOT_DIR/firmware/diagnostics/two_way_serial_test/two_way_nodemcu"

echo "[OK] All 7 firmware sketches compiled with zero errors."
