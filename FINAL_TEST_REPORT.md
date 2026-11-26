# SmartRoom IoT — Final Verification & Test Report

**Report Date:** 2026-11-26  
**Project Directory:** `/Users/hemanth/Desktop/iota project /smartroom-iot`  
**Environment:** macOS (Apple Silicon), Node `v24.22.0`, npm `11.19.1`, Mosquitto `2.1.4`, Arduino CLI `1.6.0` (`arduino:avr 1.8.8`, `esp8266:esp8266 3.1.2`), Python `3.12.15` (`opencv-contrib-python 5.1.0`, `numpy 2.5.5`, `pyserial 3.5`), Playwright Chromium  
**Detected LAN IP (`en0`):** `10.247.220.74`

---

## 1. Successfully Completed

- **Tooling & Environment Installation:** Installed `mosquitto 2.1.4`, `arduino-cli 1.6.0`, `arduino:avr@1.8.8`, `esp8266:esp8266@3.1.2`, Arduino libraries (`Keypad 3.1.1`, `LiquidCrystal I2C 1.1.2`, `Servo 1.3.0`, `PubSubClient 2.8`, `ArduinoJson 7.4.3`), local Python `.venv` (`opencv-contrib-python 5.1.0.95`, `numpy 2.5.5`, `pyserial 3.5`), `qrcode`, `qrcode-terminal`, and Playwright Chromium.
- **Firmware Compilation (All 7 Sketches Compiled with Zero Errors via `npm run firmware:compile`):**
  - `firmware/arduino/smartroom_arduino` (`arduino:avr:uno`): `15,576` bytes flash (48%), `1,313` bytes global SRAM (64%), leaving `735` bytes for local variables.
  - `firmware/esp8266/smartroom_esp8266` (`esp8266:esp8266:nodemcuv2`): `270,220` bytes IROM (25%), `32,044` bytes RAM (39%). Includes 3 configurable buzzer modes (`BUZZER_MODE_ACTIVE_HIGH`, `BUZZER_MODE_ACTIVE_LOW`, `BUZZER_MODE_PASSIVE_PWM`), non-blocking `millis()` timing, `secrets.h` support, `setSocketTimeout(2)`, and SNTP/`ttlMs` command expiration.
  - All 5 diagnostic sketches compiled cleanly (`arduino_serial_tx_test`, `nodemcu_serial_rx_test`, `nodemcu_buzzer_test` [3-mode auto-cycle], `two_way_arduino`, `two_way_nodemcu`).
- **Frontend & Backend Builds (`npm run build`):**
  - `frontend`: `tsc -b && vite build` succeeded cleanly (`2156` modules transformed).
  - `backend`: `nest build` succeeded with 0 errors.
- **Automated Backend Tests (`npm run test`):**
  - Unit tests (`npm test`): **2/2 suites passed, 10/10 tests passed** (MQTT payload validation + Email service preferences, cooldown, retries, and failure logging with mocked Nodemailer transport).
  - E2E tests (`npm run test:e2e`): **1/1 suite passed, 5/5 tests passed** (unauthorized rejection, login validation, Socket.IO JWT auth + live emission, MQTT event deduplication, command ACK/timeout, and offline rejection against in-memory SQLite).
- **Database, Security, & Bug Fixes:**
  - Verified all 9 SQLite tables via `npm run setup`, idempotent `npm run seed:admin`, and repaired placeholder `MY_RECIPIENT_EMAIL` fallback to `admin@smartroom.local`.
  - Fixed a real SQLite `UNIQUE constraint failed: devices.deviceId` race condition in `DevicesService.ensureDeviceExists` and added per-device sequential MQTT message queuing in `MqttService`.
  - Fixed `SettingsPage.tsx` `<form>` scope so Change Password inputs never block Notification Preferences submission.
  - Added `POST /api/settings/verify-smtp` (`transporter.verify()`), `lastEmailAttempt` & `lastSmtpError` diagnostics, `GET /api/health` dynamic LAN IP + `mobileUrl`, and scannable Mobile QR Code on `AboutProjectPage.tsx` and terminal startup (`npm run dev`).

---

## 2. Verified Using Real Local Services

- **Real Mosquitto Broker (`1883`) Auth & ACLs:**
  - Anonymous `mosquitto_pub` rejected (`allow_anonymous false`).
  - Authenticated `mosquitto_pub` ↔ `mosquitto_sub` succeeded for `smartroom_backend`.
  - ACL in `mqtt/acl.conf` blocked `smartroom_device` from publishing to `smartroom/smartroom-01/commands`.
- **One-Command Startup & Doctor (`npm run dev`, `npm run status`, `npm run doctor`):**
  - Mosquitto (`1883`), NestJS Backend (`3000`), and Vite Frontend (`5173`) started cleanly and passed `/api/health` (`database: "connected"`, `mqttConnected: true`, `lanIp: "10.247.220.74"`).
- **Real LAN Proxy (`http://10.247.220.74:5173`) & Persistence:**
  - Verified HTTP `200` on frontend HTML, `/api/health`, admin login, Socket.IO connection through LAN proxy, all 12 core REST endpoints, offline `smartroom-01` `409` rejection, SMTP placeholder rejection on `POST /api/settings/test-email`, and SQLite persistence across `npm run stop && npm run dev`.
- **Playwright Automated Browser Tests (`npm run test:browser`):**
  - **Desktop (`1280x800`):** Verified login validation, password visibility toggle, authenticated login, offline Unlock button disabled state, explicit Demo Mode isolation + confirmation modal, all 9 pages via sidebar navigation, Settings save & `Verify SMTP` diagnostic, QR code PNG rendering, and Logout.
  - **Mobile (`390x844` via `http://10.247.220.74:5173`):** Verified mobile login, mobile navigation drawer, and all 9 pages with **zero horizontal overflow** and **zero console/500 errors**.

---

## 3. Verified Using Simulation (`scripts/simulate-device.js`)

- Connected `smartroom-sim-01` (`smartroom_simulator`) to the real authenticated Mosquitto broker and verified:
  - Live telemetry ingestion (`12` Socket.IO `telemetry:update` events), `LED_ON`/`LED_OFF`, `WRONG_PASSWORD`, `UNKNOWN_FACE`, `UNLOCK_PASSWORD`, `DOOR_LOCKED`, `BUZZER_OFF` (`7` `security:alert` and `7` `notification:new` events), app-level `events/ack`, duplicate event rejection (`sim-dedup-test-001`), real Mosquitto remote `UNLOCK` & `LOCK` `ACKNOWLEDGED` round-trip, and LWT `device:offline`.
  - Verified simulator events suppressed real SMTP emails and left `smartroom-01` (`0` events) isolated; cleaned temporary simulator test rows afterwards.

---

## 4. Requires Physical Hardware Testing (Not Yet Executed)

- No Arduino Uno or NodeMCU USB board was detected on `/dev/cu.*` (`npm run firmware:ports` showed only `/dev/cu.Bluetooth-Incoming-Port` and `/dev/cu.debug-console`).
- Flashing `smartroom_arduino`, `smartroom_esp8266`, and `firmware/diagnostics/` onto physical boards and verifying physical LM35 temperature, HC-SR04 ultrasonic `2–10 cm` fan/LED toggle, 4x4 keypad `1234#`, SG90/MG995 servo `0°/90°` + 10s auto-lock, 5s physical buzzer on `D5`, Python OpenCV webcam USB serial (`A`/`R`/`L`), and physical phone Wi-Fi access await hardware connection & user confirmation.

---

## 5. Requires User Credentials & Confirmation

- **NodeMCU Wi-Fi Credentials:** Enter `WIFI_SSID` and `WIFI_PASSWORD` inside gitignored `firmware/esp8266/smartroom_esp8266/secrets.h` before uploading to NodeMCU.
- **Buzzer Mode Confirmation:** Run `nodemcu_buzzer_test` on your physical buzzer (or share the buzzer model/photo) to confirm whether `#define BUZZER_MODE` should be `1` (Active-HIGH), `2` (Active-LOW), or `3` (Passive PWM).
- **Gmail SMTP Credentials:** Add your Gmail address, 16-character Google App Password (`https://myaccount.google.com/apppasswords`), and recipient email into `backend/.env`, restart (`npm run stop && npm run dev`), and authorize sending a real test email from **Settings**.
