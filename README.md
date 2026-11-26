# SmartRoom — Intelligent IoT Control and Security System

A full-stack, self-hosted IoT dashboard and hardware platform replacing Blynk for the **SmartRoom** college IoT security & automation hardware project.

## Key Capabilities

- **Real-Time Sensor Monitoring:** Live LM35 temperature (`°C`) and HC-SR04 ultrasonic distance (`cm`) over authenticated MQTT + Socket.IO.
- **Hardware-Faithful Control:** Remote authenticated door lock/unlock (with confirmation modal, command ID correlation, expiration, and hardware ACK verification), while preserving offline ultrasonic fan/LED toggle logic, 4x4 keypad PIN entry (`1234`), Python OpenCV USB serial face recognition (`A`/`R`/`L`), 10-second servo auto-lock, and 5-second non-blocking buzzer alarm (supporting Active-HIGH, Active-LOW, and Passive PWM modes).
- **Real SMTP Email Alerts:** Nodemailer STARTTLS HTML & plain-text email notifications for wrong passwords, unauthorized faces, high temperature (with hysteresis), device offline/reconnect, and optional door unlocks, with configurable cooldown, retry handling, and delivery logs.
- **Persistent SQLite Database (TypeORM):** Activity history with search, filters, pagination, CSV export, unread notification tracking, and real analytics charts.
- **Mobile Wi-Fi Access & QR Code:** Accessible across local Wi-Fi at `http://<LAN_IP>:5173`, with a live QR code in the terminal startup banner and on the **About Project** page.

---

## Quick Start (One-Command Lifecycle)

From `smartroom-iot/`:
```bash
npm run setup            # Checks dependencies, generates .env & MQTT/firmware secrets, migrates & seeds DB
npm run dev              # Starts Mosquitto (1883), NestJS Backend (3000), Vite Frontend (5173) + QR summary
npm run status           # Shows broker, backend, frontend, database, and device status
npm run doctor           # Verifies dependencies, ports, LAN IP, Arduino CLI cores, Python venv, and SMTP status
npm run stop             # Stops only processes owned by SmartRoom
npm run firmware:compile # Compiles Arduino Uno, NodeMCU ESP8266, and all 5 diagnostic sketches
npm run firmware:ports   # Lists connected Arduino / NodeMCU USB serial ports
npm run test             # Runs backend unit tests and E2E integration tests
npm run test:browser     # Runs Playwright browser verification across desktop & mobile viewports
npm run face:register    # Enrolls authorized face samples locally into scripts/face_recognition/data/
npm run face:start       # Starts Python OpenCV LBPH face recognition USB serial bridge (9600 baud)
```

For full beginner setup, hardware wiring, serial diagnostics, Gmail App Password configuration, and test results, see [FINAL_SETUP_GUIDE.md](FINAL_SETUP_GUIDE.md) and [FINAL_TEST_REPORT.md](FINAL_TEST_REPORT.md).

---

## Repository Structure

```text
smartroom-iot/
├── frontend/                     # React + Vite + TypeScript + Tailwind CSS dashboard
├── backend/                      # NestJS + TypeORM + SQLite + MQTT.js + Socket.IO + Nodemailer
├── firmware/
│   ├── arduino/
│   │   ├── smartroom_arduino/    # Arduino Uno production sketch (compiled via arduino-cli)
│   │   └── smartroom_arduino.ino # Symlink to smartroom_arduino/smartroom_arduino.ino
│   ├── esp8266/
│   │   ├── smartroom_esp8266/    # NodeMCU ESP8266 sketch + secrets.example.h + gitignored secrets.h
│   │   └── smartroom_esp8266.ino # Symlink to smartroom_esp8266/smartroom_esp8266.ino
│   └── diagnostics/              # Serial TX, Serial RX, 3-mode Buzzer, and Two-Way test sketches
├── mqtt/                         # Mosquitto config, topic ACLs, local config & hashed passwords
├── scripts/                      # Lifecycle scripts, doctor, device simulator, Python face module, Playwright test
├── docs/                         # Detailed hardware, MQTT, SMTP, API, deployment, and troubleshooting docs
├── docker-compose.yml
├── FINAL_SETUP_GUIDE.md
├── FINAL_TEST_REPORT.md
└── README.md
```
