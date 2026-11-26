import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as nodemailer from 'nodemailer';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { Setting } from '../settings/entities/setting.entity';
import { EmailLog } from './entities/email-log.entity';
import { EmailTemplatePayload, renderSmartRoomEmail } from './email.templates';

export interface EmailDispatchRequest {
  eventId?: string | null;
  category:
    | 'WRONG_PASSWORD'
    | 'UNKNOWN_FACE'
    | 'DOOR_UNLOCKED'
    | 'HIGH_TEMPERATURE'
    | 'DEVICE_OFFLINE'
    | 'TEST_EMAIL';
  subject: string;
  template: Omit<EmailTemplatePayload, 'dashboardUrl'>;
  setting: Setting | null;
  overrideRecipient?: string;
  bypassCooldown?: boolean;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly lastSentInMemory = new Map<string, number>();

  constructor(
    @InjectRepository(EmailLog)
    private readonly emailLogRepo: Repository<EmailLog>,
    private readonly configService: ConfigService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {
    this.initTransporter();
  }

  private isPlaceholderValue(value?: string | null): boolean {
    if (!value) return true;
    const v = value.trim().toLowerCase();
    return (
      !v ||
      v.includes('my_gmail_address') ||
      v.includes('my_google_app_password') ||
      v.includes('my_recipient_email') ||
      v.includes('your-email@gmail.com') ||
      v.includes('your-google-app-password') ||
      v.includes('recipient@example.com') ||
      v.startsWith('replace-with-')
    );
  }

  private initTransporter(): void {
    const host = this.configService.get<string>('smtp.host');
    const port = this.configService.get<number>('smtp.port') || 587;
    const secure = this.configService.get<boolean>('smtp.secure') || false;
    const user = this.configService.get<string>('smtp.user');
    const pass = this.configService.get<string>('smtp.pass');

    if (
      !host ||
      this.isPlaceholderValue(user) ||
      this.isPlaceholderValue(pass)
    ) {
      this.logger.warn(
        'SMTP credentials are not configured (placeholders detected); real email delivery disabled until SMTP_USER and SMTP_PASS are set.',
      );
      this.transporter = null;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure, // false for STARTTLS on port 587
      requireTLS: !secure && port === 587,
      tls: {
        rejectUnauthorized: true,
      },
      auth: { user, pass },
    });
  }

  isSmtpConfigured(): boolean {
    return this.transporter !== null;
  }

  async verifyConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.transporter) {
      return {
        ok: false,
        message:
          'SMTP credentials are not configured (set SMTP_USER and SMTP_PASS in backend/.env).',
      };
    }
    try {
      await this.transporter.verify();
      return {
        ok: true,
        message: 'SMTP server handshake and STARTTLS authentication verified.',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'SMTP verification failed';
      this.logger.warn(`SMTP transporter.verify() failed: ${msg}`);
      return { ok: false, message: msg };
    }
  }

  async getLatestLog(): Promise<EmailLog | null> {
    return this.emailLogRepo.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Used in tests or runtime reconfiguration to replace Nodemailer transport.
   */
  setTransporterForTesting(transporter: nodemailer.Transporter | null): void {
    this.transporter = transporter;
  }

  formatTimestamp(date: Date, timezone = 'Asia/Kolkata'): string {
    try {
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: timezone,
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(date);
    } catch {
      return date.toISOString();
    }
  }

  isCategoryEnabled(setting: Setting | null, category: EmailDispatchRequest['category']): boolean {
    if (category === 'TEST_EMAIL') return true;
    if (!setting) return false;
    if (!setting.emailEnabled) return false;

    switch (category) {
      case 'WRONG_PASSWORD':
        return setting.wrongPasswordEnabled;
      case 'UNKNOWN_FACE':
        return setting.unknownFaceEnabled;
      case 'DOOR_UNLOCKED':
        return setting.doorUnlockEnabled;
      case 'HIGH_TEMPERATURE':
        return setting.highTemperatureEnabled;
      case 'DEVICE_OFFLINE':
        return setting.deviceOfflineEnabled;
      default:
        return false;
    }
  }

  async getRecentLogs(limit = 50): Promise<EmailLog[]> {
    return this.emailLogRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async findLatestByEventId(eventId: string): Promise<EmailLog | null> {
    return this.emailLogRepo.findOne({
      where: { eventId },
      order: { createdAt: 'DESC' },
    });
  }

  async findLogsByEventIds(eventIds: string[]): Promise<Map<string, EmailLog>> {
    const map = new Map<string, EmailLog>();
    if (!eventIds.length) return map;
    const logs = await this.emailLogRepo
      .createQueryBuilder('log')
      .where('log.eventId IN (:...eventIds)', { eventIds })
      .orderBy('log.createdAt', 'DESC')
      .getMany();
    for (const log of logs) {
      if (log.eventId && !map.has(log.eventId)) {
        map.set(log.eventId, log);
      }
    }
    return map;
  }

  private async isWithinCooldown(
    recipient: string,
    category: EmailDispatchRequest['category'],
    subject: string,
    cooldownSeconds: number,
  ): Promise<boolean> {
    if (cooldownSeconds <= 0) return false;
    const key = `${recipient.toLowerCase()}::${category}`;
    const memLast = this.lastSentInMemory.get(key);
    if (memLast && Date.now() - memLast < cooldownSeconds * 1000) {
      return true;
    }

    const cutoff = new Date(Date.now() - cooldownSeconds * 1000);
    const recent = await this.emailLogRepo.findOne({
      where: {
        recipient,
        subject,
        status: 'SENT',
        createdAt: MoreThanOrEqual(cutoff),
      },
      order: { createdAt: 'DESC' },
    });
    if (recent) {
      this.lastSentInMemory.set(key, recent.createdAt.getTime());
      return true;
    }
    return false;
  }

  async dispatchEmailSync(req: EmailDispatchRequest): Promise<EmailLog> {
    const recipient =
      (req.overrideRecipient || req.setting?.recipientEmail || this.configService.get<string>('smtp.defaultAlertEmail') || '').trim();

    if (!recipient) {
      const skipped = await this.emailLogRepo.save(
        this.emailLogRepo.create({
          eventId: req.eventId || null,
          recipient: 'unconfigured',
          subject: req.subject,
          status: 'FAILED',
          errorMessage: 'No recipient email address configured',
          retryCount: 0,
        }),
      );
      this.emitStatus(skipped);
      return skipped;
    }

    if (!this.isCategoryEnabled(req.setting, req.category)) {
      const skipped = await this.emailLogRepo.save(
        this.emailLogRepo.create({
          eventId: req.eventId || null,
          recipient,
          subject: req.subject,
          status: 'SKIPPED_DISABLED',
          errorMessage: 'Email notifications disabled for this category',
          retryCount: 0,
        }),
      );
      return skipped;
    }

    const cooldownSeconds = req.setting?.emailCooldown ?? 60;
    if (!req.bypassCooldown) {
      const cooledDown = await this.isWithinCooldown(
        recipient,
        req.category,
        req.subject,
        cooldownSeconds,
      );
      if (cooledDown) {
        const skipped = await this.emailLogRepo.save(
          this.emailLogRepo.create({
            eventId: req.eventId || null,
            recipient,
            subject: req.subject,
            status: 'SKIPPED_COOLDOWN',
            errorMessage: `Suppressed by ${cooldownSeconds}s email cooldown`,
            retryCount: 0,
          }),
        );
        return skipped;
      }
    }

    // Create persistent PENDING log before sending
    const pendingLog = await this.emailLogRepo.save(
      this.emailLogRepo.create({
        eventId: req.eventId || null,
        recipient,
        subject: req.subject,
        status: 'PENDING',
        errorMessage: null,
        retryCount: 0,
        sentAt: null,
      }),
    );

    if (!this.transporter) {
      pendingLog.status = 'FAILED';
      pendingLog.errorMessage =
        'SMTP transport is not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS in backend/.env)';
      const failedLog = await this.emailLogRepo.save(pendingLog);
      this.emitStatus(failedLog);
      return failedLog;
    }

    const dashboardUrl =
      this.configService.get<string>('smtp.dashboardUrl') || 'http://localhost:5173';
    const from =
      this.configService.get<string>('smtp.from') ||
      this.configService.get<string>('smtp.user') ||
      'smartroom@localhost';

    const { html, text } = renderSmartRoomEmail({
      ...req.template,
      dashboardUrl,
    });

    const maxRetries = this.configService.get<number>('smtp.retryLimit') ?? 2;
    let lastError: string | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.transporter.sendMail({
          from,
          to: recipient,
          subject: req.subject,
          text,
          html,
        });

        pendingLog.status = 'SENT';
        pendingLog.sentAt = new Date();
        pendingLog.retryCount = attempt;
        pendingLog.errorMessage = null;
        const sentLog = await this.emailLogRepo.save(pendingLog);
        this.lastSentInMemory.set(`${recipient.toLowerCase()}::${req.category}`, Date.now());
        this.logger.log(`SMTP accepted email "${req.subject}" to ${recipient}`);
        this.emitStatus(sentLog);
        return sentLog;
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Unknown SMTP error';
        pendingLog.retryCount = attempt;
        this.logger.warn(
          `Email send attempt ${attempt + 1}/${maxRetries + 1} failed for ${recipient}: ${lastError}`,
        );
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
    }

    pendingLog.status = 'FAILED';
    pendingLog.errorMessage = lastError;
    const failedLog = await this.emailLogRepo.save(pendingLog);
    this.emitStatus(failedLog);
    return failedLog;
  }

  /**
   * Non-blocking email dispatch so MQTT telemetry & event ingestion never blocks on SMTP.
   */
  queueEmail(req: EmailDispatchRequest): void {
    setImmediate(() => {
      void this.dispatchEmailSync(req).catch((err) => {
        this.logger.error(
          `Unexpected email dispatch error: ${err instanceof Error ? err.message : err}`,
        );
      });
    });
  }

  private emitStatus(log: EmailLog): void {
    this.realtimeGateway.emitEmailStatus({
      id: log.id,
      eventId: log.eventId,
      recipient: log.recipient,
      subject: log.subject,
      status: log.status,
      errorMessage: log.errorMessage,
      sentAt: log.sentAt,
      createdAt: log.createdAt,
    });
  }
}
