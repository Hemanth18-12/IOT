import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DevicesService } from '../devices/devices.service';
import { EmailService } from '../email/email.service';
import { SafeUser, UsersService } from '../users/users.service';
import { TestEmailDto, UpdateSettingsDto } from './dto/update-settings.dto';
import { Setting } from './entities/setting.entity';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Setting)
    private readonly settingRepo: Repository<Setting>,
    private readonly usersService: UsersService,
    private readonly devicesService: DevicesService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async getOrCreateForUser(user: SafeUser): Promise<Setting> {
    let setting = await this.settingRepo.findOne({ where: { userId: user.id } });
    if (!setting) {
      const rawDefaultAlert =
        (this.configService.get<string>('smtp.defaultAlertEmail') || '').trim();
      const defaultAlertEmail =
        rawDefaultAlert.includes('@') && !rawDefaultAlert.toLowerCase().includes('example.com')
          ? rawDefaultAlert
          : user.email;
      setting = await this.settingRepo.save(
        this.settingRepo.create({
          userId: user.id,
          recipientEmail: defaultAlertEmail,
          emailEnabled: true,
          wrongPasswordEnabled: true,
          unknownFaceEnabled: true,
          doorUnlockEnabled: false,
          highTemperatureEnabled: true,
          deviceOfflineEnabled: true,
          temperatureThreshold: 35.0,
          emailCooldown: 60,
          timezone: 'Asia/Kolkata',
        }),
      );
    }
    return setting;
  }

  async getPrimaryAlertSetting(): Promise<Setting | null> {
    const first = await this.settingRepo.find({ take: 1 });
    if (first.length > 0) return first[0];
    const users = await this.usersService.findAll();
    if (users.length === 0) return null;
    return this.getOrCreateForUser(this.usersService.toSafeUser(users[0]));
  }

  async getSettingsView(user: SafeUser) {
    const setting = await this.getOrCreateForUser(user);
    const device = await this.devicesService.getDefaultDevice();
    const recentEmailLogs = await this.emailService.getRecentLogs(10);
    const lastEmailAttempt = await this.emailService.getLatestLog();

    return {
      settings: setting,
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      device: {
        deviceId: device.deviceId,
        name: device.name,
        online: device.online,
        lastSeen: device.lastSeen,
        firmwareVersion: device.firmwareVersion,
      },
      connectionInfo: {
        defaultDeviceId: device.deviceId,
        mqttEnabled: this.configService.get<boolean>('mqtt.enabled') ?? true,
        mqttBrokerHost: this.sanitizeBrokerUrl(
          this.configService.get<string>('mqtt.brokerUrl') || '',
        ),
        smtpConfigured: this.emailService.isSmtpConfigured(),
        smtpHost: this.configService.get<string>('smtp.host') || null,
        smtpPort: this.configService.get<number>('smtp.port') || 587,
        lastEmailAttempt,
        lastSmtpError:
          lastEmailAttempt?.status === 'FAILED' ? lastEmailAttempt.errorMessage : null,
      },
      recentEmailLogs,
    };
  }

  async verifySmtpConnection() {
    return this.emailService.verifyConnection();
  }

  private sanitizeBrokerUrl(raw: string): string {
    try {
      const parsed = new URL(raw);
      return `${parsed.protocol}//${parsed.hostname}:${parsed.port || '1883'}`;
    } catch {
      return 'configured';
    }
  }

  async updateSettings(user: SafeUser, dto: UpdateSettingsDto) {
    const setting = await this.getOrCreateForUser(user);
    let updatedUser = user;

    if (dto.profileName !== undefined) {
      updatedUser = await this.usersService.updateProfile(user.id, {
        name: dto.profileName,
      });
    }

    if (dto.deviceName !== undefined) {
      const defaultDeviceId =
        this.configService.get<string>('defaultDevice.deviceId') || 'smartroom-01';
      await this.devicesService.updateDeviceName(defaultDeviceId, dto.deviceName);
    }

    if (dto.recipientEmail !== undefined) {
      setting.recipientEmail = dto.recipientEmail.trim();
    }
    if (dto.emailEnabled !== undefined) setting.emailEnabled = dto.emailEnabled;
    if (dto.wrongPasswordEnabled !== undefined) {
      setting.wrongPasswordEnabled = dto.wrongPasswordEnabled;
    }
    if (dto.unknownFaceEnabled !== undefined) {
      setting.unknownFaceEnabled = dto.unknownFaceEnabled;
    }
    if (dto.doorUnlockEnabled !== undefined) {
      setting.doorUnlockEnabled = dto.doorUnlockEnabled;
    }
    if (dto.highTemperatureEnabled !== undefined) {
      setting.highTemperatureEnabled = dto.highTemperatureEnabled;
    }
    if (dto.deviceOfflineEnabled !== undefined) {
      setting.deviceOfflineEnabled = dto.deviceOfflineEnabled;
    }
    if (dto.temperatureThreshold !== undefined) {
      setting.temperatureThreshold = dto.temperatureThreshold;
    }
    if (dto.emailCooldown !== undefined) setting.emailCooldown = dto.emailCooldown;
    if (dto.timezone !== undefined) setting.timezone = dto.timezone;

    await this.settingRepo.save(setting);
    return this.getSettingsView(updatedUser);
  }

  async sendTestEmail(user: SafeUser, dto: TestEmailDto) {
    const setting = await this.getOrCreateForUser(user);
    const device = await this.devicesService.getDefaultDevice();
    const now = new Date();

    const log = await this.emailService.dispatchEmailSync({
      category: 'TEST_EMAIL',
      subject: 'SmartRoom — Test Email Notification',
      setting,
      overrideRecipient: dto.recipientEmail || setting.recipientEmail,
      bypassCooldown: true,
      template: {
        title: 'SMTP Notification Test',
        badgeText: 'TEST OK',
        badgeVariant: 'info',
        deviceName: device.name,
        deviceId: device.deviceId,
        eventType: 'TEST_EMAIL',
        timestampFormatted: this.emailService.formatTimestamp(now, setting.timezone),
        doorStateText: device.state?.doorUnlocked ? 'Unlocked (reported)' : 'Locked (reported)',
        description:
          'This test message confirms your SmartRoom backend can connect to the configured SMTP server and submit alert emails.',
        extraRows: [
          { label: 'Triggered By', value: `${user.name} (${user.email})` },
          {
            label: 'Note',
            value: 'SMTP acceptance confirms server submission; check inbox/spam for delivery.',
          },
        ],
      },
    });

    return {
      accepted: log.status === 'SENT',
      status: log.status,
      message:
        log.status === 'SENT'
          ? `SMTP accepted test email for ${log.recipient}`
          : log.errorMessage || 'Email delivery failed',
      log,
    };
  }
}
