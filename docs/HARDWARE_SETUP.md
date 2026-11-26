# SmartRoom Hardware Wiring & Firmware Setup Guide

## 1. Safety & Important Engineering Notes

- **Common Ground:** Connect **Arduino GND**, **NodeMCU GND**, **external Servo PSU GND**, and **DC motor driver GND** together. Without a shared ground, serial bytes and PWM signals will fail unpredictably.
- **3.3V Level Shifting (Critical):** Arduino Uno pins output **5V**, while NodeMCU ESP8266 GPIO pins are **3.3V**. Driving NodeMCU `D2 (GPIO4)` directly with 5V from Arduino `A3` can damage the ESP8266. Always wire the **1kΩ + 2kΩ voltage divider**:
  ```text
  Arduino A3 (5V TX) ──[ 1kΩ Resistor ]──┬──> NodeMCU D2 / GPIO4 (3.3V RX)
                                         │
                                    [ 2kΩ Resistor ]
                                         │
                                        GND
  ```
  - NodeMCU `D1 / GPIO5 (3.3V TX)` connects directly to Arduino `A2 (RX)` (3.3V is reliably read as logic HIGH by ATmega328P).
- **External Servo Power:** Power the servo from a separate **regulated 5V supply** (e.g., 5V 2A adapter or buck converter), not from the Arduino 5V pin, to avoid brownout resets.
- **Mechanical Lock Design:** The firmware detaches the servo **~700 ms** after reaching `0°` (locked) or `90°` (unlocked) and pulls `D12` `LOW`. Your physical latch must stay mechanically locked without continuous holding torque.
- **SoftwareSerial + Servo Timing:** Because `SoftwareSerial` and `Servo.h` compete for AVR interrupts on Arduino Uno, `smartroom_arduino.ino` keeps SoftwareSerial quiet during the 700 ms servo motion window and sends acknowledgments immediately after detaching.
- **Prototype Disclaimer:** SmartRoom is a B.Tech educational IoT prototype—not a certified commercial security lock—and the laptop Python OpenCV face recognition script is a demonstration module (not liveness-hardened production biometrics). Door status reflects the commanded servo state because there is no physical door-contact sensor.

---

## 2. Arduino Uno Pin Configuration (Preserved)

| Pin | Connected Component | Notes |
| --- | --- | --- |
| `D0` | Hardware Serial RX | USB serial from Laptop Python face recognition (`9600` baud) |
| `D1` | Hardware Serial TX | USB serial to Laptop (`9600` baud) |
| `D2 – D5` | 4x4 Keypad Rows `R1 – R4` | |
| `D6 – D9` | 4x4 Keypad Columns `C1 – C4` | Default PIN `1234`, `#` submit, `*` clear, `D` lock |
| `D10` | HC-SR04 `TRIG` | 10 µs ultrasonic trigger pulse |
| `D11` | HC-SR04 `ECHO` | 100 ms sampling, `2–10 cm` gesture trigger |
| `D12` | Servo Signal | `0°` locked, `90°` unlocked, auto-lock `10s`, detach `700ms` |
| `D13` | DC Motor Driver Input (Fan) | Use protected motor driver / MOSFET stage |
| `A0` | LM35 Temperature Sensor | Analog output (`10 mV / °C`) |
| `A1` | External Room LED | Connect in series with `220Ω` resistor |
| `A2` | SoftwareSerial `RX` | Connects to NodeMCU `D1 (GPIO5)` |
| `A3` | SoftwareSerial `TX` | Connects via `1kΩ/2kΩ` divider to NodeMCU `D2 (GPIO4)` |
| `A4` | 16x2 I2C LCD `SDA` | Default I2C address `0x27` (change to `0x3F` if needed) |
| `A5` | 16x2 I2C LCD `SCL` | |

---

## 3. NodeMCU ESP8266 Pin Configuration (Preserved)

| Pin | GPIO | Function | Notes |
| --- | --- | --- | --- |
| `D1` | `GPIO5` | SoftwareSerial `TX` | Connects to Arduino `A2` (`9600` baud) |
| `D2` | `GPIO4` | SoftwareSerial `RX` | Receives from Arduino `A3` via `1kΩ/2kΩ` divider |
| `D4` | `GPIO2` | Built-in Indicator LED | Active LOW (`LOW` = Wi-Fi & MQTT connected) |
| `D5` | `GPIO14` | Active Buzzer Signal | Active HIGH (`3.3V` module or transistor driver), `5s` `millis()` alarm |

---

## 4. Installing Arduino IDE Libraries

In Arduino IDE (`Library Manager` -> `Ctrl+Shift+I` / `Cmd+Shift+I`), install:
1. **Keypad** by Mark Stanley, Alexander Brevig
2. **LiquidCrystal_I2C** by Frank de Brabander (or compatible `LiquidCrystal I2C`)
3. **PubSubClient** by Nick O'Leary
4. **ArduinoJson** by Benoit Blanchon (v6 or v7)

For NodeMCU ESP8266 board support:
- `Preferences` -> Additional Boards Manager URLs:
  `https://arduino.esp8266.com/stable/package_esp8266com_index.json`
- `Boards Manager` -> install **esp8266 by ESP8266 Community** -> select **NodeMCU 1.0 (ESP-12E Module)**.

---

## 5. Uploading Firmware

### A. Arduino Uno (`firmware/arduino/smartroom_arduino.ino`)
1. Temporarily unplug jumpers from `D0`/`D1` if anything is wired there (USB uses D0/D1).
2. Open `firmware/arduino/smartroom_arduino.ino` in Arduino IDE (if Arduino IDE asks to create a folder named `smartroom_arduino`, accept).
3. Select **Board: Arduino Uno** and the Arduino USB COM/cu port.
4. Click **Upload**.

### B. NodeMCU ESP8266 (`firmware/esp8266/smartroom_esp8266.ino`)
1. Open `firmware/esp8266/smartroom_esp8266.ino`.
2. Edit the configuration constants at the top:
   - `WIFI_SSID` & `WIFI_PASSWORD` (must be **2.4 GHz Wi-Fi**; ESP8266 does not support 5 GHz).
   - `MQTT_BROKER_IP`: Enter your computer's **LAN IPv4 address** (e.g., `192.168.1.25`). **Never use `localhost` or `127.0.0.1`**, because inside NodeMCU `localhost` refers to the NodeMCU itself!
   - `MQTT_USERNAME` (`smartroom_device`) and `MQTT_PASSWORD` (matching `mqtt/passwords`).
3. Select **Board: NodeMCU 1.0 (ESP-12E Module)** and Upload.
4. Open Serial Monitor at **115200 baud** to confirm `[WiFi]`, `[MQTT] Connected successfully`, and `[Arduino -> NodeMCU] S,...` logs.

---

## 6. Running the Python Face Recognition Program

- Close Arduino IDE Serial Monitor before starting Python—only one process can open the Arduino USB serial port (`D0/D1` @ `9600` baud).
- Your existing OpenCV script sends:
  - `'A'` -> Authorized face (unlocks door, sends `UNLOCK_FACE` to website, stops buzzer)
  - `'R'` -> Unauthorized face (triggers 5s buzzer, sends `UNKNOWN_FACE` alert & email)
  - `'L'` -> Locks door (`DOOR_LOCKED`)
- A minimal test utility is included at `scripts/face_recognition_demo.py`:
  ```bash
  pip install pyserial
  python3 scripts/face_recognition_demo.py --port /dev/cu.usbmodem1101
  ```
