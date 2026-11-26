import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import * as nodemailer from 'nodemailer';
import { Repository } from 'typeorm';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { Setting } from '../settings/entities/setting.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { SecurityEvent } from '../events/entities/security-event.entity';
import { EmailService } from './email.service';
import { EmailLog } from './entities/email-log.entity';

describe('EmailService', () => {
  let emailService: EmailService;
  let emailLogRepo: Repository<EmailLog>;
  let moduleRef: Awaited<ReturnType<typeof Test.createTestingModule>>['compile'] extends () => Promise<infer T> ? T : never;

  const mockGateway = {
    emitEmailStatus: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [EmailLog, SecurityEvent, Setting, User],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([EmailLog]),
      ],
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const map: Record<string, unknown> = {
                'smtp.host': 'smtp.gmail.com',
                'smtp.port': 587,
                'smtp.secure': false,
                'smtp.user': 'sender@gmail.com',
                'smtp.pass': 'app-password',
                'smtp.from': 'SmartRoom <sender@gmail.com>',
                'smtp.defaultAlertEmail': 'alerts@example.com',
                'smtp.dashboardUrl': 'http://localhost:5173',
                'smtp.retryLimit': 1,
              };
              return map[key];
            },
          },
        },
        {
          provide: RealtimeGateway,
          useValue: mockGateway,
        },
      ],
    }).compile();

    emailService = moduleRef.get(EmailService);
    emailLogRepo = moduleRef.get(getRepositoryToken(EmailLog));
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  const makeSetting = (overrides: Partial<Setting> = {}): Setting => ({
    id: 'setting-1',
    userId: 'user-1',
    recipientEmail: 'owner@example.com',
    emailEnabled: true,
    wrongPasswordEnabled: true,
    unknownFaceEnabled: true,
    doorUnlockEnabled: false,
    highTemperatureEnabled: true,
    deviceOfflineEnabled: true,
    temperatureThreshold: 35,
    emailCooldown: 60,
    timezone: 'Asia/Kolkata',
    ...overrides,
  });

  const baseTemplate = {
    title: 'Security Alert',
    badgeText: 'HIGH ALERT',
    badgeVariant: 'danger' as const,
    deviceName: 'SmartRoom Primary',
    deviceId: 'smartroom-01',
    eventType: 'WRONG_PASSWORD',
    timestampFormatted: '26 Nov 2026, 3:00 PM',
    doorStateText: 'Locked (reported)',
    description: 'Wrong keypad password entered',
  };

  it('respects notification category preferences (SKIPPED_DISABLED)', async () => {
    const sendMail = jest.fn();
    emailService.setTransporterForTesting({ sendMail } as unknown as nodemailer.Transporter);

    const log = await emailService.dispatchEmailSync({
      category: 'DOOR_UNLOCKED',
      subject: 'SmartRoom — Door Unlocked',
      setting: makeSetting({ doorUnlockEnabled: false }),
      template: baseTemplate,
    });

    expect(log.status).toBe('SKIPPED_DISABLED');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('sends email and enforces cooldown for repeated alerts', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'msg-1' });
    emailService.setTransporterForTesting({ sendMail } as unknown as nodemailer.Transporter);

    const setting = makeSetting({ emailCooldown: 120 });

    const first = await emailService.dispatchEmailSync({
      category: 'WRONG_PASSWORD',
      subject: 'SmartRoom Security Alert — Wrong Password',
      setting,
      template: baseTemplate,
    });
    expect(first.status).toBe('SENT');
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(mockGateway.emitEmailStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SENT' }),
    );

    const second = await emailService.dispatchEmailSync({
      category: 'WRONG_PASSWORD',
      subject: 'SmartRoom Security Alert — Wrong Password',
      setting,
      template: baseTemplate,
    });
    expect(second.status).toBe('SKIPPED_COOLDOWN');
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('records FAILED status and errorMessage when SMTP throws', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('535 Authentication failed'));
    emailService.setTransporterForTesting({ sendMail } as unknown as nodemailer.Transporter);

    const log = await emailService.dispatchEmailSync({
      category: 'UNKNOWN_FACE',
      subject: 'SmartRoom Security Alert — Unauthorized Face',
      setting: makeSetting(),
      template: baseTemplate,
    });

    expect(log.status).toBe('FAILED');
    expect(log.errorMessage).toContain('535 Authentication failed');
    expect(log.retryCount).toBe(1);
    expect(sendMail).toHaveBeenCalledTimes(2); // initial + 1 retry

    const stored = await emailLogRepo.findOne({ where: { id: log.id } });
    expect(stored?.status).toBe('FAILED');
  });

  it('supports test email even when event notifications are disabled', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'test-1' });
    emailService.setTransporterForTesting({ sendMail } as unknown as nodemailer.Transporter);

    const log = await emailService.dispatchEmailSync({
      category: 'TEST_EMAIL',
      subject: 'SmartRoom — Test Email Notification',
      setting: makeSetting({ emailEnabled: false }),
      bypassCooldown: true,
      template: baseTemplate,
    });

    expect(log.status).toBe('SENT');
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
