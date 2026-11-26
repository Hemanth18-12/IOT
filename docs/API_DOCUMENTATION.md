# SmartRoom REST API & Socket.IO Documentation

Interactive Swagger documentation is also served automatically by the backend at:
`http://localhost:3000/api/docs`

All endpoints except `/api/auth/login` and `/api/health` require header:
`Authorization: Bearer <jwt_token>`

---

## 1. REST Endpoints

### Authentication
- `POST /api/auth/login` — Body: `{ email, password, rememberMe? }` → `{ accessToken, expiresIn, user }` (rate-limited: 10 req/min)
- `POST /api/auth/logout` — Authenticated session sign-out
- `GET /api/auth/me` — Current user profile
- `POST /api/auth/change-password` — Body: `{ currentPassword, newPassword }`

### Dashboard & System
- `GET /api/dashboard/overview?deviceId=smartroom-01` — Aggregated state, alerts today, recent telemetry, recent activity, unread count
- `GET /api/health` — Public health check (`status`, `database`, `mqttConnected`, `uptimeSeconds`)

### Devices & Remote Door Control
- `GET /api/devices` — List devices and current state
- `GET /api/devices/:id` — Single device by `deviceId` or UUID
- `GET /api/devices/:id/status` — Online, stale flag, lastSeen, state
- `POST /api/devices/:id/unlock` — Body: `{ confirmed: true }` → creates `PENDING` command, publishes non-retained MQTT `UNLOCK` (rejects with `409` if offline)
- `POST /api/devices/:id/lock` — Body: `{ confirmed: true }` → publishes non-retained MQTT `LOCK`
- `GET /api/commands/:id` — Poll command status (`PENDING | ACKNOWLEDGED | TIMEOUT | FAILED | REJECTED_OFFLINE`)

### Telemetry
- `GET /api/telemetry/latest?deviceId=smartroom-01`
- `GET /api/telemetry/history?deviceId=smartroom-01&range=1h|today|24h|7d|30d&limit=500`

### Security Events & Activity History
- `GET /api/events?search=&eventType=&authenticationMethod=&severity=&from=&to=&page=1&limit=20`
- `GET /api/events/export?...` — Downloads RFC-4180 CSV file
- `GET /api/events/:id`

### Notifications
- `GET /api/notifications?severity=&eventType=&unreadOnly=false&page=1&limit=25`
- `PATCH /api/notifications/:id/read`
- `PATCH /api/notifications/read-all`

### Settings
- `GET /api/settings` — Alert preferences + redacted connection diagnostics (never returns secrets)
- `PATCH /api/settings` — Update email toggles, recipient, cooldown, threshold, timezone, deviceName, profileName
- `POST /api/settings/test-email` — Body: `{ recipientEmail? }`

### Analytics
- `GET /api/analytics/temperature?range=1h|today|7d|30d`
- `GET /api/analytics/security?range=1h|today|7d|30d`
- `GET /api/analytics/device-usage?range=1h|today|7d|30d`

---

## 2. Socket.IO Real-Time Events

Connect with JWT token in handshake:
```js
const socket = io('http://localhost:3000', { auth: { token } });
```

Server emits to authenticated clients:
- `telemetry:update`
- `device:state`
- `device:online`
- `device:offline`
- `security:alert`
- `notification:new`
- `command:status`
- `buzzer:state`
- `email:status`
