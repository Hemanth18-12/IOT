# SmartRoom IoT — Final Setup & Demonstration Guide

This guide explains in simple language how to run the **SmartRoom** web app, configure Gmail alerts, upload compiled Arduino/NodeMCU firmware, diagnose serial & buzzer wiring, run Python face recognition, and connect your phone.

---

## 1. Quick Start Commands (Already Installed & Running)

All local tools (`node`, `mosquitto`, `arduino-cli` with `arduino:avr` & `esp8266:esp8266` cores, Python `.venv` with OpenCV, and Playwright) are installed and initialized.

From `/Users/hemanth/Desktop/iota project /smartroom-iot`:

- `npm run dev` — Starts Mosquitto (`1883`), NestJS Backend (`3000`), and Vite Frontend (`5173`), and prints the mobile QR code.
- `npm run status` — Shows running processes, API health, SQLite count, and hardware status.
- `npm run doctor` — Runs full diagnostics (tools, LAN IP, connected USB boards, Python OpenCV, SMTP config status).
- `npm run stop` — Stops only SmartRoom-owned processes.
- `npm run firmware:compile` — Compiles Arduino Uno, NodeMCU ESP8266, and all diagnostic sketches with `arduino-cli`.
- `npm run firmware:ports` — Detects plugged-in Arduino / NodeMCU USB serial ports.

---

## 2. Website Login & Access URLs

- **Desktop Website:** `http://localhost:5173`
- **Mobile Phone Website (Same Wi-Fi):** `http://10.247.220.74:5173` *(also available as a scannable QR code on the **About Project** page and in `npm run dev` output)*
- **Swagger API Docs:** `http://localhost:3000/api/docs`

### How to Retrieve Your Admin Login Password
All generated secrets stay strictly inside your gitignored `backend/.env` file:
1. Run `grep -E "ADMIN_EMAIL|ADMIN_PASSWORD" backend/.env` in Terminal (or open `backend/.env`).
2. Log in at `http://localhost:5173` using `admin@smartroom.local` and the `ADMIN_PASSWORD` shown there.
3. Change your password anytime under **Settings → Change Password**.

---

## 3. Complete Hardware Pin Configuration (Preserved)

### Arduino Uno Pins
| Pin | Component | Notes |
| --- | --- | --- |
| `D0` | Hardware Serial RX | USB serial from Laptop Python face recognition (`9600` baud) |
| `D1` | Hardware Serial TX | USB serial to Laptop (`9600` baud) |
| `D2–D5` | 4x4 Keypad Rows `R1–R4` | PIN `1234`, `#` submit, `*` clear, `D` manual lock |
| `D6–D9` | 4x4 Keypad Cols `C1–C4` | |
| `D10` | HC-SR04 Ultrasonic `TRIG` | `100 ms` sampling |
| `D11` | HC-SR04 Ultrasonic `ECHO` | `2–10 cm` toggles Fan & LED; `3` clear readings (`>=12 cm` or no echo) re-arm |
| `D12` | Servo Motor Signal | `0°` locked, `90°` unlocked, auto-lock `10s`, detach after `700 ms`, external `5V` PSU |
| `D13` | DC Motor Driver (Fan) | Protected motor driver; works offline independently of door lock |
| `A0` | LM35 Temperature Sensor | Analog `10 mV / °C` converted to Celsius |
| `A1` | External Room LED | In series with `220Ω` resistor; toggles with Fan |
| `A2` | SoftwareSerial `RX` (`9600`) | Direct wire from NodeMCU `D1 (GPIO5 TX)` |
| `A3` | SoftwareSerial `TX` (`9600`) | **MUST pass through 1kΩ / 2kΩ voltage divider** to NodeMCU `D2 (GPIO4 RX)` |
| `A4` | 16x2 I2C LCD `SDA` | Default address `0x27` (or `0x3F`) |
| `A5` | 16x2 I2C LCD `SCL` | |

### NodeMCU ESP8266 Pins
| Pin | GPIO | Function |
| --- | --- | --- |
| `D1` | `GPIO5` | SoftwareSerial `TX` → Arduino `A2` (`9600` baud) |
| `D2` | `GPIO4` | SoftwareSerial `RX` ← Arduino `A3` via `1kΩ/2kΩ` divider (`9600` baud) |
| `D4` | `GPIO2` | Built-in Wi-Fi / MQTT status LED (active LOW) |
| `D5` | `GPIO14` | Buzzer signal (`5s` non-blocking `millis()` alarm; supports Active-HIGH, Active-LOW, or Passive PWM) |

### Mandatory Voltage Divider (`Arduino A3` → `NodeMCU D2`)
```text
Arduino A3 (5V TX) ──[ 1kΩ ]──┬──> NodeMCU D2 / GPIO4 (3.3V RX)
                              │
                           [ 2kΩ ]
                              │
                             GND  <── Connect Arduino GND, NodeMCU GND, and Servo PSU GND together!
```
Never connect 5V Arduino `A3` directly to 3.3V NodeMCU `D2`, and never apply 5V directly to ESP8266 pins.

---

## 4. Configuring Firmware Credentials & Uploading

1. Open gitignored [secrets.h](firmware/esp8266/smartroom_esp8266/secrets.h) (already pre-populated with your local `MQTT_BROKER_IP = "10.247.220.74"`, `MQTT_USERNAME = "smartroom_device"`, and `MQTT_PASSWORD`).
2. Replace `YOUR_WIFI_SSID` and `YOUR_WIFI_PASSWORD` with your **2.4 GHz Wi-Fi** name and password.
3. Plug in Arduino Uno and NodeMCU via USB and run `npm run firmware:ports` to see their `/dev/cu.usb*` ports.
4. Test the buzzer hardware first if your buzzer was previously silent:
   - Upload `firmware/diagnostics/nodemcu_buzzer_test` (`arduino-cli upload -p <NODEMCU_PORT> --fqbn esp8266:esp8266:nodemcuv2 firmware/diagnostics/nodemcu_buzzer_test`) and open Serial Monitor at `115200` baud.
   - Note which mode (`Active-HIGH` = `1`, `Active-LOW` = `2`, `Passive PWM` = `3`) sounds your buzzer, then set `#define BUZZER_MODE` in [smartroom_esp8266.ino](firmware/esp8266/smartroom_esp8266/smartroom_esp8266.ino) accordingly.
   - *(Note: A bare 2-pin 5V buzzer requires an NPN transistor driver such as 2N2222 + 1kΩ base resistor; a 3-pin 3.3V active module connects directly to `3V3`, `GND`, and `D5`.)*
5. Run `npm run firmware:compile`, then upload:
   ```bash
   arduino-cli upload -p <ARDUINO_PORT> --fqbn arduino:avr:uno firmware/arduino/smartroom_arduino
   arduino-cli upload -p <NODEMCU_PORT> --fqbn esp8266:esp8266:nodemcuv2 firmware/esp8266/smartroom_esp8266
   ```

---

## 5. Gmail Email Notification Setup

1. Open [Google Account App Passwords](https://myaccount.google.com/apppasswords) (requires **2-Step Verification** enabled under Google Account Security).
2. Create an App Password named `SmartRoom IoT` and copy the 16 characters (no spaces).
3. Edit `backend/.env` and replace the placeholders:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your_gmail@gmail.com
   SMTP_PASS=your16charapppassword
   EMAIL_FROM=your_gmail@gmail.com
   DEFAULT_ALERT_EMAIL=recipient@example.com
   ```
   *(If your account cannot create Google App Passwords, set `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` to a supported STARTTLS SMTP provider like Brevo/Mailtrap/SendGrid on port `587`.)*
4. Restart SmartRoom (`npm run stop && npm run dev`).
5. In the website **Settings** page, click **Verify SMTP** (runs `transporter.verify()`) and then **Send Test Email**, then confirm arrival in your inbox/spam folder.

---

## 6. Python Face Recognition Usage

A Python virtual environment (`.venv`) with `opencv-contrib-python`, `numpy`, and `pyserial` is already installed:
1. Close Arduino IDE Serial Monitor so the Arduino USB port is free.
2. Enroll your face locally (never uploaded to backend):
   ```bash
   npm run face:register -- --name "Hemanth" --id 1 --samples 30
   ```
3. Run live recognition (auto-detects Arduino `/dev/cu.usb*` port at `9600` baud; press `l` to lock, `q` to quit):
   ```bash
   npm run face:start
   ```
   *(Use `--dry-run` to test webcam detection before plugging in Arduino.)*

---

## 7. Mobile Access & macOS Firewall

1. Ensure your phone is on the same Wi-Fi network as this Mac.
2. Scan the QR code shown in **About Project** (or in Terminal after `npm run dev`), or visit `http://10.247.220.74:5173`.
3. If macOS Firewall prompts to allow incoming connections for `node` or `mosquitto`, click **Allow** (or allow them under **System Settings → Network → Firewall** for local Wi-Fi testing).
