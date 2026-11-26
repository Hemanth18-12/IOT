import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThan, Repository } from 'typeorm';
import { DevicesService } from '../devices/devices.service';
import { Telemetry } from './entities/telemetry.entity';

export interface TelemetryReadingInput {
  temperature: number;
  distance: number;
  fanState: boolean;
  ledState: boolean;
  doorUnlocked: boolean;
  buzzerState: boolean;
}

interface LastSampleMeta {
  persistedAt: number;
  fanState: boolean;
  ledState: boolean;
  doorUnlocked: boolean;
  buzzerState: boolean;
}

@Injectable()
export class TelemetryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryService.name);
  private readonly lastSamples = new Map<string, LastSampleMeta>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(Telemetry)
    private readonly telemetryRepo: Repository<Telemetry>,
    private readonly devicesService: DevicesService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    // Run data retention cleanup hourly
    this.cleanupTimer = setInterval(() => {
      void this.purgeExpiredTelemetry();
    }, 60 * 60 * 1000);
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  async recordSampleIfDue(
    deviceId: string,
    reading: TelemetryReadingInput,
    force = false,
  ): Promise<Telemetry | null> {
    const nowMs = Date.now();
    const intervalMs =
      this.configService.get<number>('telemetry.sampleIntervalMs') ?? 10000;
    const prev = this.lastSamples.get(deviceId);

    const discreteStateChanged =
      !prev ||
      prev.fanState !== reading.fanState ||
      prev.ledState !== reading.ledState ||
      prev.doorUnlocked !== reading.doorUnlocked ||
      prev.buzzerState !== reading.buzzerState;

    const intervalElapsed = !prev || nowMs - prev.persistedAt >= intervalMs;

    if (!force && !discreteStateChanged && !intervalElapsed) {
      return null;
    }

    const row = this.telemetryRepo.create({
      deviceId,
      temperature: Number(reading.temperature.toFixed(2)),
      distance: Number(reading.distance.toFixed(2)),
      fanState: reading.fanState,
      ledState: reading.ledState,
      doorUnlocked: reading.doorUnlocked,
      buzzerState: reading.buzzerState,
      timestamp: new Date(nowMs),
    });

    const saved = await this.telemetryRepo.save(row);
    this.lastSamples.set(deviceId, {
      persistedAt: nowMs,
      fanState: reading.fanState,
      ledState: reading.ledState,
      doorUnlocked: reading.doorUnlocked,
      buzzerState: reading.buzzerState,
    });
    return saved;
  }

  async getLatest(deviceId?: string) {
    const device = deviceId
      ? await this.devicesService.findOneByIdOrDeviceId(deviceId)
      : await this.devicesService.getDefaultDevice();

    const latestRecord = await this.telemetryRepo.findOne({
      where: { deviceId: device.deviceId },
      order: { timestamp: 'DESC' },
    });

    return {
      device,
      state: device.state,
      latestRecord,
    };
  }

  resolveRangeStart(range?: string): Date {
    const now = Date.now();
    switch (range) {
      case '1h':
        return new Date(now - 60 * 60 * 1000);
      case 'today': {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
      }
      case '24h':
        return new Date(now - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now - 30 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now - 60 * 60 * 1000);
    }
  }

  async getHistory(params: {
    deviceId?: string;
    range?: string;
    from?: string;
    to?: string;
    limit?: number;
  }) {
    const device = params.deviceId
      ? await this.devicesService.findOneByIdOrDeviceId(params.deviceId)
      : await this.devicesService.getDefaultDevice();

    const fromDate = params.from
      ? new Date(params.from)
      : this.resolveRangeStart(params.range);
    const toDate = params.to ? new Date(params.to) : new Date();
    const limit = Math.min(Math.max(params.limit || 500, 1), 5000);

    const records = await this.telemetryRepo.find({
      where: {
        deviceId: device.deviceId,
        timestamp: Between(fromDate, toDate),
      },
      order: { timestamp: 'ASC' },
      take: limit,
    });

    return {
      deviceId: device.deviceId,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      count: records.length,
      items: records,
    };
  }

  async purgeExpiredTelemetry(): Promise<number> {
    const retentionDays =
      this.configService.get<number>('telemetry.retentionDays') ?? 30;
    if (retentionDays <= 0) return 0;

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.telemetryRepo.delete({
      timestamp: LessThan(cutoff),
    });
    const deleted = result.affected || 0;
    if (deleted > 0) {
      this.logger.log(`Purged ${deleted} telemetry records older than ${retentionDays} days`);
    }
    return deleted;
  }
}
