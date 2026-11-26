# Eclipse Mosquitto MQTT Broker Setup Guide

SmartRoom uses **authenticated two-way MQTT** over Eclipse Mosquitto with topic-level ACLs (`mqtt/acl.conf`) and Last Will and Testament (LWT) offline detection. Never expose port `1883` directly to the public internet without TLS and firewall restrictions.

---

## Option A: Local Installation (Recommended for Development & Hardware Demo)

### macOS
```bash
brew install mosquitto
```

Generate the hashed password file inside the project:
```bash
cd smartroom-iot
chmod +x scripts/setup-mqtt.sh
./scripts/setup-mqtt.sh
```
Enter strong passwords when prompted for `smartroom_backend` and `smartroom_device`.

Start Mosquitto using a local macOS config copy pointing to your project paths (because `mqtt/mosquitto.conf` uses `/mosquitto/config/...` paths for Docker):
```bash
# Create local runtime config
mkdir -p mqtt/data
sed "s|/mosquitto/config/|$(pwd)/mqtt/|g; s|/mosquitto/data/|$(pwd)/mqtt/data/|g" mqtt/mosquitto.conf > mqtt/mosquitto.local.conf
mosquitto -c mqtt/mosquitto.local.conf -v
```

### Windows
1. Download and install **Eclipse Mosquitto** from https://mosquitto.org/download/ (default path `C:\Program Files\mosquitto`).
2. Open PowerShell as Administrator in `smartroom-iot`:
   ```powershell
   .\scripts\setup-mqtt.ps1
   ```
3. Copy `mqtt\mosquitto.conf` to `mqtt\mosquitto.local.conf` and replace `/mosquitto/config/` and `/mosquitto/data/` with full Windows paths (using forward slashes, e.g., `C:/smartroom-iot/mqtt/passwords`).
4. Stop any default Windows Mosquitto service if running (`Stop-Service mosquitto`), then launch in foreground to see live logs:
   ```powershell
   & "C:\Program Files\mosquitto\mosquitto.exe" -c .\mqtt\mosquitto.local.conf -v
   ```
5. **Windows Firewall:** Allow inbound TCP port `1883` (Private/Home network only!) in Windows Defender Firewall so NodeMCU on your Wi-Fi can reach your PC.

---

## Option B: Docker Compose (Backend + Mosquitto)

1. Generate `mqtt/passwords` first using `./scripts/setup-mqtt.sh` (or `setup-mqtt.ps1`).
2. Copy `backend/.env.example` to `backend/.env` and fill in `MQTT_PASSWORD` (matching `smartroom_backend`), `JWT_SECRET`, and `ADMIN_PASSWORD`.
3. Launch:
   ```bash
   docker compose up -d --build
   docker compose exec backend npm run seed:admin
   ```

---

## MQTT Topic Reference (`deviceId = smartroom-01`)

| Topic | Direction | Retain | Purpose |
| --- | --- | --- | --- |
| `smartroom/smartroom-01/telemetry` | NodeMCU → Backend | `false` | JSON sensor & state readings |
| `smartroom/smartroom-01/state` | NodeMCU → Backend | `true` | Retained latest device state |
| `smartroom/smartroom-01/events` | NodeMCU → Backend | `false` | Security & access events with `eventId` |
| `smartroom/smartroom-01/events/ack` | Backend → NodeMCU | `false` | App-level ACK for QoS-0 PubSubClient retries |
| `smartroom/smartroom-01/commands` | Backend → NodeMCU | `false` | Non-retained `UNLOCK` / `LOCK` with `commandId` & `expiresAt` |
| `smartroom/smartroom-01/ack` | NodeMCU → Backend | `false` | Correlated hardware execution result |
| `smartroom/smartroom-01/availability` | NodeMCU → Backend | `true` | Online heartbeat & LWT offline message |
