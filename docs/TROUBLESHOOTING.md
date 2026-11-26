# SmartRoom Troubleshooting Guide

## 1. NodeMCU Connects to Wi-Fi but Fails MQTT (`rc=-2` or `rc=5`)
- **`rc=-2` (Network unreachable):**
  1. Check that `MQTT_BROKER_IP` in `smartroom_esp8266.ino` is your computer's **actual LAN IPv4 address** (NOT `localhost` or `127.0.0.1`).
  2. Ensure both NodeMCU and your computer are on the same **2.4 GHz** Wi-Fi subnet (disable AP client isolation if using a hotspot/campus Wi-Fi).
  3. Confirm Mosquitto is listening on `0.0.0.0:1883` (`listener 1883 0.0.0.0`) and your OS firewall permits inbound TCP `1883`.
- **`rc=5` (Not authorized):**
  - Re-run `./scripts/setup-mqtt.sh` (or `.ps1`) and ensure `MQTT_USERNAME = "smartroom_device"` and `MQTT_PASSWORD` match `mqtt/passwords`.

## 2. Backend Says `Device Offline` Even Though NodeMCU Is Powered
- Open Arduino IDE Serial Monitor on NodeMCU at **115200 baud** and check connection logs.
- Confirm `DEVICE_ID` (`smartroom-01`) matches `DEFAULT_DEVICE_ID` in `backend/.env`.
- Check that Mosquitto ACL (`mqtt/acl.conf`) grants `smartroom_device` write permission on `smartroom/smartroom-01/availability` and `telemetry`.

## 3. Arduino and NodeMCU Not Talking Over SoftwareSerial
- Verify cross-wiring: Arduino `A3 (TX)` → `1kΩ/2kΩ` voltage divider → NodeMCU `D2 (GPIO4 RX)`; NodeMCU `D1 (GPIO5 TX)` → Arduino `A2 (RX)`.
- Verify **common GND** wire connects Arduino `GND` to NodeMCU `GND`.
- Confirm both sketches use `9600` baud on SoftwareSerial.

## 4. Servo Jitters or Resets Arduino
- Power the servo from an external **5V 2A regulated power supply** (never from the Arduino 5V pin) with shared GND.
- Ensure `SERVO_PIN` stays `D12`; `smartroom_arduino.ino` detaches the servo after 700 ms to prevent SoftwareSerial/Timer1 interference.

## 5. I2C LCD Screen Blank or Shows Blocks
- Adjust the contrast potentiometer on the blue I2C backpack on the back of the LCD.
- If still blank, your I2C module may be at address `0x3F` instead of `0x27` — update `LiquidCrystal_I2C lcd(0x27, 16, 2);` in `smartroom_arduino.ino`.

## 6. Remote Unlock Shows `TIMEOUT`
- Check NodeMCU Serial Monitor (115200 baud) for `[NodeMCU -> Arduino] UNLOCK:<uuid>`.
- If NodeMCU prints `ARDUINO_ACK_TIMEOUT`, Arduino did not receive the serial line or did not reply with `ACK:...` within 5 seconds. Check `D1 (NodeMCU)` → `A2 (Arduino)` wire.

## 7. Gmail Test Email Fails (`535 Username and Password not accepted`)
- You must use a **16-character Google App Password**, not your normal Gmail login password.
- Ensure `SMTP_PORT=587` and `SMTP_SECURE=false` in `backend/.env`.

## 8. Phone on Same Wi-Fi Cannot Open Website
- Start frontend with `npm run dev` (which passes `--host` to Vite).
- Open `http://<YOUR_COMPUTER_LAN_IP>:5173` on the phone.
- Add `http://<YOUR_COMPUTER_LAN_IP>:5173` to `CORS_ORIGINS` in `backend/.env` if running in production mode.
- Allow TCP ports `5173` and `3000` in macOS/Windows firewall for local network access.
