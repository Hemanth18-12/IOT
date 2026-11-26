import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, In, Repository } from 'typeorm';
import { DevicesService } from '../devices/devices.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SettingsService } from '../settings/settings.service';
import { EventSeverity, SecurityEvent } from './entities/security-event.entity';

export interface RecordEventInput {
  externalEventId?: string | null;
  deviceId: string;
  eventType: string;
  authenticationMethod?: string | null;
  severity?: EventSeverity;
  description: string;
  timestamp?: Date;
  doorUnlocked?: boolean;
  temperature?: number;
  threshold?: number;
  lastSeen?: Date | null;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @InjectRepository(SecurityEvent)
    private readonly eventsRepo: Repository<SecurityEvent>,
    private readonly devicesService: DevicesService,
    private readonly settingsService: SettingsService,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  inferSeverity(eventType: string, fallback?: EventSeverity): EventSeverity {
    if (fallback) return fallback;
    switch (eventType) {
      case 'WRONG_PASSWORD':
      case 'UNKNOWN_FACE':
      case 'DEVICE_OFFLINE':
        return 'HIGH';
      case 'HIGH_TEMPERATURE':
      case 'BUZZER_ON':
        return 'MEDIUM';
      default:
        return 'LOW';
    }
  }

  inferAuthMethod(eventType: string, explicit?: string | null): string | null {
    if (explicit) return explicit;
    switch (eventType) {
      case 'UNLOCK_PASSWORD':
      case 'WRONG_PASSWORD':
        return 'KEYPAD';
      case 'UNLOCK_FACE':
      case 'UNKNOWN_FACE':
        return 'FACE_RECOGNITION';
      case 'UNLOCK_REMOTE':
      case 'UNLOCK_BLYNK':
        return 'REMOTE_WEB';
      case 'DOOR_LOCKED':
        return 'AUTO_LOCK';
      default:
        return 'SYSTEM';
    }
  }

  async recordEvent(
    input: RecordEventInput,
  ): Promise<{ event: SecurityEvent; duplicate: boolean }> {
    if (input.externalEventId) {
      const existing = await this.eventsRepo.findOne({
        where: { externalEventId: input.externalEventId },
      });
      if (existing) {
        this.logger.debug(`Deduplicated duplicate eventId: ${input.externalEventId}`);
        return { event: existing, duplicate: true };
      }
    }

    const device = await this.devicesService.ensureDeviceExists(input.deviceId);
    const severity = this.inferSeverity(input.eventType, input.severity);
    const authenticationMethod = this.inferAuthMethod(
      input.eventType,
      input.authenticationMethod,
    );
    const timestamp = input.timestamp || new Date();

    let saved: SecurityEvent;
    try {
      saved = await this.eventsRepo.save(
        this.eventsRepo.create({
          externalEventId: input.externalEventId || null,
          deviceId: input.deviceId,
          eventType: input.eventType,
          authenticationMethod,
          severity,
          description: input.description,
          timestamp,
        }),
      );
    } catch (err) {
      // Handle race condition on unique externalEventId
      if (input.externalEventId) {
        const raceExisting = await this.eventsRepo.findOne({
          where: { externalEventId: input.externalEventId },
        });
        if (raceExisting) {
          return { event: raceExisting, duplicate: true };
        }
      }
      throw err;
    }

    const isAlertEvent = [
      'WRONG_PASSWORD',
      'UNKNOWN_FACE',
      'DEVICE_OFFLINE',
      'HIGH_TEMPERATURE',
      'UNLOCK_PASSWORD',
      'UNLOCK_FACE',
      'UNLOCK_REMOTE',
      'UNLOCK_BLYNK',
    ].includes(saved.eventType);

    if (isAlertEvent) {
      this.realtimeGateway.emitSecurityAlert({
        event: saved,
        deviceName: device.name,
      });

      const title = this.formatAlertTitle(saved.eventType);
      await this.notificationsService.createForAllUsers({
        eventId: saved.id,
        eventType: saved.eventType,
        title,
        message: saved.description,
        severity: saved.severity,
      });
    }

    await this.dispatchEmailIfNeeded(saved, device.name, input);

    return { event: saved, duplicate: false };
  }

  private formatAlertTitle(eventType: string): string {
    switch (eventType) {
      case 'WRONG_PASSWORD':
        return 'Wrong Keypad Password Alert';
      case 'UNKNOWN_FACE':
        return 'Unauthorized Face Detected';
      case 'UNLOCK_PASSWORD':
        return 'Door Unlocked via Keypad';
      case 'UNLOCK_FACE':
        return 'Door Unlocked via Face Recognition';
      case 'UNLOCK_REMOTE':
      case 'UNLOCK_BLYNK':
        return 'Door Unlocked Remotely';
      case 'DEVICE_OFFLINE':
        return 'Hardware Device Offline';
      case 'HIGH_TEMPERATURE':
        return 'High Temperature Threshold Exceeded';
      default:
        return eventType.replace(/_/g, ' ');
    }
  }

  private async dispatchEmailIfNeeded(
    event: SecurityEvent,
    deviceName: string,
    input: RecordEventInput,
  ): Promise<void> {
    const isSimulatorDevice =
      event.deviceId.includes('-sim') || event.description.startsWith('[SIMULATOR]');
    if (isSimulatorDevice && process.env.ALLOW_SIMULATOR_EMAILS !== 'true') {
      this.logger.debug(
        `Suppressed real SMTP email for simulated device ${event.deviceId} (${event.eventType})`,
      );
      return;
    }

    const setting = await this.settingsService.getPrimaryAlertSetting();
    const timezone = setting?.timezone || 'Asia/Kolkata';
    const timestampFormatted = this.emailService.formatTimestamp(event.timestamp, timezone);

    const deviceWithState = await this.devicesService.findOneByIdOrDeviceId(event.deviceId);
    const doorUnlocked =
      input.doorUnlocked !== undefined
        ? input.doorUnlocked
        : Boolean(deviceWithState.state?.doorUnlocked);
    const doorStateText = doorUnlocked ? 'Unlocked (reported)' : 'Locked (reported)';

    switch (event.eventType) {
      case 'WRONG_PASSWORD':
        this.emailService.queueEmail({
          eventId: event.id,
          category: 'WRONG_PASSWORD',
          subject: 'SmartRoom Security Alert — Wrong Password',
          setting,
          template: {
            title: 'Security Alert: Wrong Keypad Password',
            badgeText: 'HIGH ALERT',
            badgeVariant: 'danger',
            deviceName,
            deviceId: event.deviceId,
            eventType: event.eventType,
            timestampFormatted,
            doorStateText,
            description: event.description,
            warningText:
              'An incorrect keypad password was entered and the local 5-second buzzer alarm was triggered. Verify physical room security if this attempt was unexpected.',
            extraRows: [{ label: 'Authentication Method', value: '4x4 Keypad' }],
          },
        });
        break;

      case 'UNKNOWN_FACE':
        this.emailService.queueEmail({
          eventId: event.id,
          category: 'UNKNOWN_FACE',
          subject: 'SmartRoom Security Alert — Unauthorized Face',
          setting,
          template: {
            title: 'Security Alert: Unauthorized Face Detected',
            badgeText: 'HIGH ALERT',
            badgeVariant: 'danger',
            deviceName,
            deviceId: event.deviceId,
            eventType: event.eventType,
            timestampFormatted,
            doorStateText,
            description: event.description,
            warningText:
              'An unrecognized face triggered the local 5-second buzzer alarm. No face photograph was uploaded or attached to protect privacy.',
            extraRows: [{ label: 'Authentication Method', value: 'Camera Face Recognition' }],
          },
        });
        break;

      case 'UNLOCK_PASSWORD':
      case 'UNLOCK_FACE':
      case 'UNLOCK_REMOTE':
      case 'UNLOCK_BLYNK':
        this.emailService.queueEmail({
          eventId: event.id,
          category: 'DOOR_UNLOCKED',
          subject: 'SmartRoom — Door Unlocked',
          setting,
          template: {
            title: 'Door Lock Opened',
            badgeText: 'DOOR UNLOCKED',
            badgeVariant: 'success',
            deviceName,
            deviceId: event.deviceId,
            eventType: event.eventType,
            timestampFormatted,
            doorStateText,
            description: event.description,
            extraRows: [
              {
                label: 'Authentication Method',
                value: event.authenticationMethod || 'AUTHORIZED',
              },
            ],
          },
        });
        break;

      case 'HIGH_TEMPERATURE':
        this.emailService.queueEmail({
          eventId: event.id,
          category: 'HIGH_TEMPERATURE',
          subject: 'SmartRoom Alert — High Temperature Threshold Exceeded',
          setting,
          template: {
            title: 'High Room Temperature Alert',
            badgeText: 'TEMP WARNING',
            badgeVariant: 'warning',
            deviceName,
            deviceId: event.deviceId,
            eventType: event.eventType,
            timestampFormatted,
            doorStateText,
            description: event.description,
            extraRows: [
              {
                label: 'Measured Temperature',
                value:
                  input.temperature !== undefined ? `${input.temperature.toFixed(1)} °C` : 'N/A',
              },
              {
                label: 'Configured Threshold',
                value:
                  input.threshold !== undefined ? `${input.threshold.toFixed(1)} °C` : 'N/A',
              },
            ],
          },
        });
        break;

      case 'DEVICE_OFFLINE':
        this.emailService.queueEmail({
          eventId: event.id,
          category: 'DEVICE_OFFLINE',
          subject: 'SmartRoom Alert — Device Offline',
          setting,
          template: {
            title: 'SmartRoom Node Disconnected',
            badgeText: 'OFFLINE',
            badgeVariant: 'warning',
            deviceName,
            deviceId: event.deviceId,
            eventType: event.eventType,
            timestampFormatted,
            doorStateText,
            description: event.description,
            warningText:
              'Remote web unlock/lock is disabled while the NodeMCU is offline. Local Arduino keypad, auto-lock, ultrasonic fan/LED, and buzzer continue working independently.',
            extraRows: [
              {
                label: 'Last Communication',
                value: input.lastSeen
                  ? this.emailService.formatTimestamp(new Date(input.lastSeen), timezone)
                  : 'Never connected',
              },
            ],
          },
        });
        break;

      case 'DEVICE_ONLINE':
        this.emailService.queueEmail({
          eventId: event.id,
          category: 'DEVICE_OFFLINE',
          subject: 'SmartRoom — Device Reconnected',
          setting,
          template: {
            title: 'SmartRoom Node Reconnected',
            badgeText: 'ONLINE',
            badgeVariant: 'success',
            deviceName,
            deviceId: event.deviceId,
            eventType: event.eventType,
            timestampFormatted,
            doorStateText,
            description: event.description,
            extraRows: [{ label: 'Status', value: 'Connected to MQTT broker' }],
          },
        });
        break;

      default:
        break;
    }
  }

  async findEvents(query: {
    deviceId?: string;
    eventType?: string;
    authenticationMethod?: string;
    severity?: string;
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(query.page || 1, 1);
    const limit = Math.min(Math.max(query.limit || 20, 1), 200);

    const qb = this.eventsRepo.createQueryBuilder('event');

    if (query.deviceId) {
      qb.andWhere('event.deviceId = :deviceId', { deviceId: query.deviceId });
    }
    if (query.eventType) {
      qb.andWhere('event.eventType = :eventType', { eventType: query.eventType });
    }
    if (query.authenticationMethod) {
      qb.andWhere('event.authenticationMethod = :authMethod', {
        authMethod: query.authenticationMethod,
      });
    }
    if (query.severity) {
      qb.andWhere('event.severity = :severity', { severity: query.severity });
    }
    if (query.from) {
      qb.andWhere('event.timestamp >= :from', { from: new Date(query.from) });
    }
    if (query.to) {
      qb.andWhere('event.timestamp <= :to', { to: new Date(query.to) });
    }
    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(event.description) LIKE :term OR LOWER(event.eventType) LIKE :term OR LOWER(event.deviceId) LIKE :term OR LOWER(event.id) LIKE :term)',
        { term },
      );
    }

    qb.orderBy('event.timestamp', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    const emailLogsMap = await this.emailService.findLogsByEventIds(items.map((e) => e.id));

    const enriched = items.map((item) => {
      const log = emailLogsMap.get(item.id);
      return {
        ...item,
        emailStatus: log ? log.status : 'NOT_APPLICABLE',
        emailError: log?.errorMessage || null,
        emailSentAt: log?.sentAt || null,
      };
    });

    return {
      items: enriched,
      total,
      page,
      limit,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    };
  }

  async findOne(id: string) {
    const event = await this.eventsRepo.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException(`Security event "${id}" not found`);
    }
    const log = await this.emailService.findLatestByEventId(event.id);
    return {
      ...event,
      emailStatus: log ? log.status : 'NOT_APPLICABLE',
      emailError: log?.errorMessage || null,
      emailSentAt: log?.sentAt || null,
    };
  }

  async exportCsv(query: {
    deviceId?: string;
    eventType?: string;
    authenticationMethod?: string;
    severity?: string;
    search?: string;
    from?: string;
    to?: string;
  }): Promise<string> {
    const result = await this.findEvents({ ...query, page: 1, limit: 2000 });
    const headers = [
      'Event ID',
      'Timestamp',
      'Device ID',
      'Event Type',
      'Authentication Method',
      'Severity',
      'Description',
      'Email Notification Status',
    ];

    const escapeCsv = (val: unknown): string => {
      const str = val === null || val === undefined ? '' : String(val);
      if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const lines = [
      headers.join(','),
      ...result.items.map((row) =>
        [
          row.id,
          new Date(row.timestamp).toISOString(),
          row.deviceId,
          row.eventType,
          row.authenticationMethod || '',
          row.severity,
          row.description,
          row.emailStatus,
        ]
          .map(escapeCsv)
          .join(','),
      ),
    ];

    return lines.join('\r\n');
  }

  async getTodaySecuritySummary(deviceId?: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const now = new Date();

    const whereToday: FindOptionsWhere<SecurityEvent> = {
      timestamp: Between(startOfDay, now),
    };
    if (deviceId) whereToday.deviceId = deviceId;

    const todayEvents = await this.eventsRepo.find({ where: whereToday });
    const alertsToday = todayEvents.filter((e) =>
      ['WRONG_PASSWORD', 'UNKNOWN_FACE', 'DEVICE_OFFLINE', 'HIGH_TEMPERATURE'].includes(
        e.eventType,
      ),
    ).length;

    const lastSuccess = await this.eventsRepo.findOne({
      where: {
        ...(deviceId ? { deviceId } : {}),
        eventType: In(['UNLOCK_PASSWORD', 'UNLOCK_FACE', 'UNLOCK_REMOTE', 'UNLOCK_BLYNK']),
      },
      order: { timestamp: 'DESC' },
    });

    const lastUnauthorized = await this.eventsRepo.findOne({
      where: {
        ...(deviceId ? { deviceId } : {}),
        eventType: In(['WRONG_PASSWORD', 'UNKNOWN_FACE']),
      },
      order: { timestamp: 'DESC' },
    });

    const latestAlert = await this.eventsRepo.findOne({
      where: {
        ...(deviceId ? { deviceId } : {}),
        severity: In(['HIGH', 'CRITICAL', 'MEDIUM']),
      },
      order: { timestamp: 'DESC' },
    });

    return {
      alertsToday,
      lastSuccess,
      lastUnauthorized,
      latestAlert,
    };
  }
}
