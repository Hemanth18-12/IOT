# Production Deployment & Remote Access Options

For local college lab demonstrations, running on your local Wi-Fi LAN is safest and simplest. When deploying SmartRoom for remote internet access, follow these security practices:

## 1. Transport Security (Mandatory Before Internet Exposure)
- **Web & API (HTTPS / WSS):** Place the NestJS backend and built React `frontend/dist` static bundle behind **Nginx** or **Caddy** with Let's Encrypt TLS certificates (`https://` and `wss://`).
- **MQTT over TLS (`8883`):** Uncomment the `listener 8883` TLS block in `mqtt/mosquitto.conf`, generate server/CA certificates, and update NodeMCU to `WiFiClientSecure` (with fingerprint or CA root) before bridging MQTT across the public internet. **Never expose unencrypted port `1883` to the public internet.**
- **Private VPN Alternative (Easiest & Safest):** Host everything on a home/lab Raspberry Pi or PC and connect remotely using **Tailscale** or **WireGuard** VPN instead of port-forwarding `1883` or `3000` on your router.

## 2. Database Migration from SQLite to PostgreSQL
TypeORM is configured to support PostgreSQL with minimal changes:
1. Create a PostgreSQL database (e.g., `smartroom`).
2. Update `backend/.env`:
   ```env
   DB_TYPE=postgres
   DATABASE_URL=postgresql://smartroom_user:strong_password@localhost:5432/smartroom
   DB_SYNCHRONIZE=false
   DB_RUN_MIGRATIONS=true
   ```
3. Run migrations & seed admin:
   ```bash
   cd backend
   npm run migration:run
   npm run seed:admin
   ```

## 3. Hardening Checklist
- Set `NODE_ENV=production` and restrict `CORS_ORIGINS` strictly to your HTTPS domain.
- Rotate `JWT_SECRET` to a 64+ character random value.
- Rotate Mosquitto passwords in `mqtt/passwords`.
- Remember: SmartRoom is a college prototype—do not rely on it as the sole physical security mechanism for high-value premises.
