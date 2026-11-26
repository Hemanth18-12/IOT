export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  database: {
    type: (process.env.DB_TYPE || 'sqlite').toLowerCase() === 'postgres' ? 'postgres' : 'sqlite',
    path: process.env.DB_PATH || './data/smartroom.sqlite',
    url: process.env.DATABASE_URL || '',
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    runMigrations: process.env.DB_RUN_MIGRATIONS !== 'false',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-only-unsafe-secret-change-me-immediately',
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    rememberExpiresIn: process.env.JWT_REMEMBER_EXPIRES_IN || '30d',
  },
  defaultDevice: {
    deviceId: process.env.DEFAULT_DEVICE_ID || 'smartroom-01',
    name: process.env.DEFAULT_DEVICE_NAME || 'SmartRoom Primary Node',
  },
  mqtt: {
    enabled: process.env.MQTT_ENABLED !== 'false',
    brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    username: process.env.MQTT_USERNAME || '',
    password: process.env.MQTT_PASSWORD || '',
    clientId: process.env.MQTT_CLIENT_ID || `smartroom-backend-${process.pid}`,
    caPath: process.env.MQTT_CA_PATH || '',
    rejectUnauthorized: process.env.MQTT_REJECT_UNAUTHORIZED !== 'false',
  },
  telemetry: {
    sampleIntervalMs: parseInt(process.env.TELEMETRY_SAMPLE_INTERVAL_MS || '10000', 10),
    retentionDays: parseInt(process.env.TELEMETRY_RETENTION_DAYS || '30', 10),
    staleSeconds: parseInt(process.env.STALE_TELEMETRY_SECONDS || '20', 10),
    offlineThresholdSeconds: parseInt(process.env.DEVICE_OFFLINE_THRESHOLD_SECONDS || '25', 10),
    commandTimeoutMs: parseInt(process.env.COMMAND_TIMEOUT_MS || '12000', 10),
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || process.env.SMTP_USER || 'smartroom@localhost',
    defaultAlertEmail: process.env.DEFAULT_ALERT_EMAIL || '',
    dashboardUrl: process.env.DASHBOARD_PUBLIC_URL || process.env.FRONTEND_URL || 'http://localhost:5173',
    retryLimit: parseInt(process.env.EMAIL_RETRY_LIMIT || '2', 10),
  },
});
