import { EventSeverity } from '../../events/entities/security-event.entity';

export interface ValidatedTelemetryPayload {
  deviceId: string;
  temperature: number;
  distance: number;
  fan: boolean;
  led: boolean;
  doorUnlocked: boolean;
  buzzer: boolean;
  firmwareVersion?: string;
}

export interface ValidatedEventPayload {
  eventId?: string;
  deviceId: string;
  event: string;
  severity?: EventSeverity;
  message: string;
}

export interface ValidatedAckPayload {
  commandId: string;
  action: 'UNLOCK' | 'LOCK';
  success: boolean;
  doorUnlocked: boolean;
  reason?: string;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

export function validateTelemetryPayload(
  raw: unknown,
  topicDeviceId: string,
): ValidatedTelemetryPayload | null {
  if (!isObject(raw)) return null;

  const deviceId = typeof raw.deviceId === 'string' && raw.deviceId.trim()
    ? raw.deviceId.trim()
    : topicDeviceId;
  if (deviceId !== topicDeviceId) return null;

  const temperature = toFiniteNumber(raw.temperature);
  const distance = toFiniteNumber(raw.distance);
  if (temperature === null || distance === null) return null;
  if (temperature < -50 || temperature > 150) return null;
  if (distance < 0 || distance > 1000) return null;

  if (
    typeof raw.fan !== 'boolean' ||
    typeof raw.led !== 'boolean' ||
    typeof raw.doorUnlocked !== 'boolean' ||
    typeof raw.buzzer !== 'boolean'
  ) {
    return null;
  }

  return {
    deviceId,
    temperature,
    distance,
    fan: raw.fan,
    led: raw.led,
    doorUnlocked: raw.doorUnlocked,
    buzzer: raw.buzzer,
    firmwareVersion:
      typeof raw.firmwareVersion === 'string' ? raw.firmwareVersion.slice(0, 64) : undefined,
  };
}

const VALID_SEVERITIES = new Set<EventSeverity>(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export function validateEventPayload(
  raw: unknown,
  topicDeviceId: string,
): ValidatedEventPayload | null {
  if (!isObject(raw)) return null;

  const deviceId = typeof raw.deviceId === 'string' && raw.deviceId.trim()
    ? raw.deviceId.trim()
    : topicDeviceId;
  if (deviceId !== topicDeviceId) return null;

  if (typeof raw.event !== 'string' || !raw.event.trim()) return null;
  const message =
    typeof raw.message === 'string' && raw.message.trim()
      ? raw.message.trim()
      : raw.event.trim();

  const severity =
    typeof raw.severity === 'string' && VALID_SEVERITIES.has(raw.severity as EventSeverity)
      ? (raw.severity as EventSeverity)
      : undefined;

  return {
    eventId: typeof raw.eventId === 'string' && raw.eventId.trim() ? raw.eventId.trim() : undefined,
    deviceId,
    event: raw.event.trim().toUpperCase().slice(0, 64),
    severity,
    message: message.slice(0, 500),
  };
}

export function validateAckPayload(raw: unknown): ValidatedAckPayload | null {
  if (!isObject(raw)) return null;
  if (typeof raw.commandId !== 'string' || !raw.commandId.trim()) return null;
  if (raw.action !== 'UNLOCK' && raw.action !== 'LOCK') return null;
  if (typeof raw.success !== 'boolean') return null;
  if (typeof raw.doorUnlocked !== 'boolean') return null;

  return {
    commandId: raw.commandId.trim(),
    action: raw.action,
    success: raw.success,
    doorUnlocked: raw.doorUnlocked,
    reason: typeof raw.reason === 'string' ? raw.reason.slice(0, 255) : undefined,
  };
}
