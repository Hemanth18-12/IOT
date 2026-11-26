export type EventSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type CommandType = 'UNLOCK' | 'LOCK';
export type CommandStatus =
  | 'PENDING'
  | 'ACKNOWLEDGED'
  | 'TIMEOUT'
  | 'FAILED'
  | 'REJECTED_OFFLINE';

export type EmailLogStatus =
  | 'PENDING'
  | 'SENT'
  | 'FAILED'
  | 'SKIPPED_COOLDOWN'
  | 'SKIPPED_DISABLED'
  | 'NOT_APPLICABLE';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'USER';
}

export interface DeviceState {
  id: string;
  deviceId: string;
  temperature: number | null;
  distance: number | null;
  fanState: boolean;
  ledState: boolean;
  doorUnlocked: boolean;
  buzzerState: boolean;
  updatedAt: string;
}

export interface DeviceWithState {
  id: string;
  deviceId: string;
  name: string;
  online: boolean;
  lastSeen: string | null;
  firmwareVersion: string | null;
  createdAt: string;
  updatedAt: string;
  stale: boolean;
  state: DeviceState | null;
}

export interface TelemetryPoint {
  id: string;
  deviceId: string;
  temperature: number;
  distance: number;
  fanState: boolean;
  ledState: boolean;
  doorUnlocked: boolean;
  buzzerState: boolean;
  timestamp: string;
}

export interface SecurityEvent {
  id: string;
  externalEventId: string | null;
  deviceId: string;
  eventType: string;
  authenticationMethod: string | null;
  severity: EventSeverity;
  description: string;
  timestamp: string;
  emailStatus?: EmailLogStatus;
  emailError?: string | null;
  emailSentAt?: string | null;
}

export interface NotificationItem {
  id: string;
  userId: string;
  eventId: string | null;
  eventType: string;
  title: string;
  message: string;
  severity: EventSeverity;
  isRead: boolean;
  createdAt: string;
}

export interface EmailLog {
  id: string;
  eventId: string | null;
  recipient: string;
  subject: string;
  status: EmailLogStatus;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
  sentAt: string | null;
}

export interface CommandRecord {
  id: string;
  deviceId: string;
  userId: string;
  commandType: CommandType;
  status: CommandStatus;
  createdAt: string;
  expiresAt: string;
  acknowledgedAt: string | null;
  failureReason: string | null;
}

export interface DashboardOverview {
  device: DeviceWithState;
  mqttConnected: boolean;
  alertsToday: number;
  lastSuccess: SecurityEvent | null;
  lastUnauthorized: SecurityEvent | null;
  latestAlert: SecurityEvent | null;
  recentActivity: SecurityEvent[];
  recentTelemetry: TelemetryPoint[];
  recentCommands: CommandRecord[];
  unreadNotifications: number;
  serverTime: string;
}

export interface SettingsData {
  id: string;
  userId: string;
  recipientEmail: string;
  emailEnabled: boolean;
  wrongPasswordEnabled: boolean;
  unknownFaceEnabled: boolean;
  doorUnlockEnabled: boolean;
  highTemperatureEnabled: boolean;
  deviceOfflineEnabled: boolean;
  temperatureThreshold: number;
  emailCooldown: number;
  timezone: string;
}

export interface SettingsView {
  settings: SettingsData;
  profile: User;
  device: {
    deviceId: string;
    name: string;
    online: boolean;
    lastSeen: string | null;
    firmwareVersion: string | null;
  };
  connectionInfo: {
    defaultDeviceId: string;
    mqttEnabled: boolean;
    mqttBrokerHost: string;
    smtpConfigured: boolean;
    smtpHost: string | null;
    smtpPort: number;
    lastEmailAttempt?: EmailLog | null;
    lastSmtpError?: string | null;
  };
  recentEmailLogs: EmailLog[];
}

export interface ToastMessage {
  id: string;
  title: string;
  message: string;
  variant: 'info' | 'success' | 'warning' | 'error';
  createdAt: string;
}
