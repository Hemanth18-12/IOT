# SmartRoom Serial & Buzzer Diagnostic Guide

Use these sketches to isolate why **NodeMCU → Arduino** worked previously while **Arduino → NodeMCU** (temperature, wrong-password buzzer, unauthorized-face buzzer) failed.

---

## Mandatory Wiring Verification (Before Flashing)

1. **NodeMCU TX → Arduino RX:** `NodeMCU D1 (GPIO5)` → `Arduino A2` (direct wire).
2. **Arduino TX → NodeMCU RX (5V to 3.3V Voltage Divider):**
   - `Arduino A3` → **1kΩ resistor** → junction → `NodeMCU D2 (GPIO4)`
   - **2kΩ resistor** from that exact same junction → `GND`
   - **NEVER connect Arduino `A3` directly to NodeMCU `D2`** (5V can damage the ESP8266 pin).
3. **Common Ground:** `Arduino GND` ↔ `NodeMCU GND` (required so voltage levels share a zero reference).

---

## Step 1: Test NodeMCU Buzzer Alone (`nodemcu_buzzer_test.ino`)
1. Flash `firmware/diagnostics/nodemcu_buzzer_test/nodemcu_buzzer_test.ino` to NodeMCU.
2. Open Serial Monitor at **115200 baud**.
3. **Expected Output:**
   ```text
   [NodeMCU Buzzer Test] Triggering 5s alarm every 10s on D5 (GPIO14)...
   BUZZER ON - 5 SECONDS
   BUZZER OFF
   ```
4. **If silent:**
   - Check if your buzzer module is active-LOW instead of active-HIGH; set `#define BUZZER_ACTIVE_HIGH false` in both the test sketch and `smartroom_esp8266.ino`.
   - Note: A bare 2-pin **passive** buzzer needs a square wave (`tone()`), whereas a 3-pin active buzzer module or 5V buzzer driven through an NPN transistor (2N2222 + 1kΩ base resistor) sounds on DC HIGH.

---

## Step 2: Test Arduino → NodeMCU One-Way Link
1. Flash `firmware/diagnostics/arduino_serial_tx_test/arduino_serial_tx_test.ino` to Arduino Uno.
2. Flash `firmware/diagnostics/nodemcu_serial_rx_test/nodemcu_serial_rx_test.ino` to NodeMCU.
3. Open NodeMCU Serial Monitor at **115200 baud**.
4. **Expected Output:**
   ```text
   [NodeMCU RX Test] Listening on D2 (GPIO4) at 9600 baud...
   [NodeMCU RX <- D2] (len=17): S,28.40,24.50,1,0
   [NodeMCU RX <- D2] (len=6): LED_ON
   [NodeMCU RX <- D2] (len=7): LED_OFF
   [NodeMCU RX <- D2] (len=14): WRONG_PASSWORD
   [NodeMCU RX <- D2] (len=12): UNKNOWN_FACE
   ```
5. **If nothing appears or `[WARN] Non-printable byte` prints:**
   - Check `1kΩ / 2kΩ` divider orientation (2kΩ MUST go to GND, 1kΩ MUST go to `A3`; swapping them drops signal too low or overvolts D2!).
   - Verify `A3` (not `A2`) goes to the divider and `D2` (GPIO4, not `D1`) connects to the divider midpoint.
   - Verify `Arduino GND` is wired to `NodeMCU GND`.

---

## Step 3: Test Two-Way Serial (`two_way_serial_test`)
1. Flash `two_way_arduino.ino` to Arduino and `two_way_nodemcu.ino` to NodeMCU.
2. **Expected NodeMCU Serial Monitor Output (115200 baud):**
   ```text
   [RX <- Arduino] S,28.40,24.50,1,0
   [TX -> Arduino] UNLOCK:diag-1
   [RX <- Arduino] ACK:diag-1:UNLOCK:1:1
   ```
3. Once all 3 diagnostic tests pass cleanly, flash the final production sketches (`firmware/arduino/smartroom_arduino.ino` and `firmware/esp8266/smartroom_esp8266.ino`).
