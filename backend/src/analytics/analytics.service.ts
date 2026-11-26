import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { DevicesService } from '../devices/devices.service';
import { SecurityEvent } from '../events/entities/security-event.entity';
import { Telemetry } from '../telemetry/entities/telemetry.entity';

export type AnalyticsRange = '1h' | 'today' | '7d' | '30d';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Telemetry)
    private readonly telemetryRepo: Repository<Telemetry>,
    @InjectRepository(SecurityEvent)
    private readonly eventsRepo: Repository<SecurityEvent>,
    private readonly devicesService: DevicesService,
  ) {}

  resolveRange(range?: string): { range: AnalyticsRange; from: Date; to: Date } {
    const to = new Date();
    let normalized: AnalyticsRange = '1h';
    let from: Date;

    switch (range) {
      case 'today':
        normalized = 'today';
        from = new Date(to);
        from.setHours(0, 0, 0, 0);
        break;
      case '7d':
        normalized = '7d';
        from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        normalized = '30d';
        from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '1h':
      default:
        normalized = '1h';
        from = new Date(to.getTime() - 60 * 60 * 1000);
        break;
    }

    return { range: normalized, from, to };
  }

  async getTemperatureAnalytics(deviceId?: string, rangeStr?: string) {
    const device = deviceId
      ? await this.devicesService.findOneByIdOrDeviceId(deviceId)
      : await this.devicesService.getDefaultDevice();
    const { range, from, to } = this.resolveRange(rangeStr);

    const rows = await this.telemetryRepo.find({
      where: {
        deviceId: device.deviceId,
        timestamp: Between(from, to),
      },
      order: { timestamp: 'ASC' },
      take: 2000,
    });

    const temps = rows.map((r) => r.temperature);
    const dists = rows.map((r) => r.distance);

    const stats = (vals: number[]) => {
      if (vals.length === 0) {
        return { min: null, max: null, avg: null };
      }
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const avg = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
      return {
        min: Number(min.toFixed(2)),
        max: Number(max.toFixed(2)),
        avg,
      };
    };

    return {
      deviceId: device.deviceId,
      range,
      from: from.toISOString(),
      to: to.toISOString(),
      sampleCount: rows.length,
      temperatureStats: stats(temps),
      distanceStats: stats(dists),
      series: rows.map((r) => ({
        timestamp: r.timestamp,
        temperature: r.temperature,
        distance: r.distance,
        fanState: r.fanState,
        ledState: r.ledState,
      })),
    };
  }

  async getSecurityAnalytics(deviceId?: string, rangeStr?: string) {
    const device = deviceId
      ? await this.devicesService.findOneByIdOrDeviceId(deviceId)
      : await this.devicesService.getDefaultDevice();
    const { range, from, to } = this.resolveRange(rangeStr);

    const events = await this.eventsRepo.find({
      where: {
        deviceId: device.deviceId,
        timestamp: Between(from, to),
      },
      order: { timestamp: 'ASC' },
    });

    let keypadUnlockCount = 0;
    let faceUnlockCount = 0;
    let remoteUnlockCount = 0;
    let wrongPasswordCount = 0;
    let unknownFaceCount = 0;

    const dailyUnauthorizedMap = new Map<
      string,
      { date: string; wrongPassword: number; unknownFace: number; total: number }
    >();
    const unlockFreqMap = new Map<
      string,
      { date: string; keypad: number; face: number; remote: number; total: number }
    >();

    for (const ev of events) {
      const dateKey = new Date(ev.timestamp).toISOString().slice(0, 10);

      if (ev.eventType === 'UNLOCK_PASSWORD') keypadUnlockCount++;
      if (ev.eventType === 'UNLOCK_FACE') faceUnlockCount++;
      if (ev.eventType === 'UNLOCK_REMOTE' || ev.eventType === 'UNLOCK_BLYNK') {
        remoteUnlockCount++;
      }
      if (ev.eventType === 'WRONG_PASSWORD') wrongPasswordCount++;
      if (ev.eventType === 'UNKNOWN_FACE') unknownFaceCount++;

      if (ev.eventType === 'WRONG_PASSWORD' || ev.eventType === 'UNKNOWN_FACE') {
        const entry = dailyUnauthorizedMap.get(dateKey) || {
          date: dateKey,
          wrongPassword: 0,
          unknownFace: 0,
          total: 0,
        };
        if (ev.eventType === 'WRONG_PASSWORD') entry.wrongPassword++;
        if (ev.eventType === 'UNKNOWN_FACE') entry.unknownFace++;
        entry.total++;
        dailyUnauthorizedMap.set(dateKey, entry);
      }

      if (
        ['UNLOCK_PASSWORD', 'UNLOCK_FACE', 'UNLOCK_REMOTE', 'UNLOCK_BLYNK'].includes(
          ev.eventType,
        )
      ) {
        const entry = unlockFreqMap.get(dateKey) || {
          date: dateKey,
          keypad: 0,
          face: 0,
          remote: 0,
          total: 0,
        };
        if (ev.eventType === 'UNLOCK_PASSWORD') entry.keypad++;
        if (ev.eventType === 'UNLOCK_FACE') entry.face++;
        if (ev.eventType === 'UNLOCK_REMOTE' || ev.eventType === 'UNLOCK_BLYNK') {
          entry.remote++;
        }
        entry.total++;
        unlockFreqMap.set(dateKey, entry);
      }
    }

    const successfulCount = keypadUnlockCount + faceUnlockCount + remoteUnlockCount;
    const failedCount = wrongPasswordCount + unknownFaceCount;

    return {
      deviceId: device.deviceId,
      range,
      from: from.toISOString(),
      to: to.toISOString(),
      totalEvents: events.length,
      successfulCount,
      failedCount,
      wrongPasswordCount,
      unknownFaceCount,
      keypadUnlockCount,
      faceUnlockCount,
      remoteUnlockCount,
      authComparison: [
        { name: 'Successful', value: successfulCount },
        { name: 'Failed', value: failedCount },
      ],
      dailyUnauthorizedSeries: Array.from(dailyUnauthorizedMap.values()),
      unlockFrequencySeries: Array.from(unlockFreqMap.values()),
    };
  }

  async getDeviceUsageAnalytics(deviceId?: string, rangeStr?: string) {
    const device = deviceId
      ? await this.devicesService.findOneByIdOrDeviceId(deviceId)
      : await this.devicesService.getDefaultDevice();
    const { range, from, to } = this.resolveRange(rangeStr);

    const rows = await this.telemetryRepo.find({
      where: {
        deviceId: device.deviceId,
        timestamp: Between(from, to),
      },
      order: { timestamp: 'ASC' },
      take: 5000,
    });

    let fanOnSeconds = 0;
    let ledOnSeconds = 0;
    let doorUnlockedSeconds = 0;
    let buzzerOnSeconds = 0;
    let fanActivations = 0;
    let ledActivations = 0;
    let doorUnlocks = 0;

    const effectiveEndMs = device.online
      ? to.getTime()
      : Math.min(to.getTime(), device.lastSeen ? new Date(device.lastSeen).getTime() : to.getTime());

    for (let i = 0; i < rows.length; i++) {
      const curr = rows[i];
      const currMs = new Date(curr.timestamp).getTime();
      const nextMs =
        i + 1 < rows.length
          ? new Date(rows[i + 1].timestamp).getTime()
          : Math.max(currMs, effectiveEndMs);

      const deltaSec = Math.max(0, (nextMs - currMs) / 1000);
      if (curr.fanState) fanOnSeconds += deltaSec;
      if (curr.ledState) ledOnSeconds += deltaSec;
      if (curr.doorUnlocked) doorUnlockedSeconds += deltaSec;
      if (curr.buzzerState) buzzerOnSeconds += deltaSec;

      if (i > 0) {
        const prev = rows[i - 1];
        if (!prev.fanState && curr.fanState) fanActivations++;
        if (!prev.ledState && curr.ledState) ledActivations++;
        if (!prev.doorUnlocked && curr.doorUnlocked) doorUnlocks++;
      } else {
        if (curr.fanState) fanActivations++;
        if (curr.ledState) ledActivations++;
        if (curr.doorUnlocked) doorUnlocks++;
      }
    }

    const totalRangeSeconds = Math.max(1, Math.round((to.getTime() - from.getTime()) / 1000));

    return {
      deviceId: device.deviceId,
      range,
      from: from.toISOString(),
      to: to.toISOString(),
      sampleCount: rows.length,
      totalRangeSeconds,
      durationsSeconds: {
        fanOn: Math.round(fanOnSeconds),
        ledOn: Math.round(ledOnSeconds),
        doorUnlocked: Math.round(doorUnlockedSeconds),
        buzzerOn: Math.round(buzzerOnSeconds),
      },
      activations: {
        fan: fanActivations,
        led: ledActivations,
        doorUnlock: doorUnlocks,
      },
      chartData: [
        {
          component: 'DC Fan',
          minutes: Number((fanOnSeconds / 60).toFixed(2)),
          activations: fanActivations,
        },
        {
          component: 'Room LED',
          minutes: Number((ledOnSeconds / 60).toFixed(2)),
          activations: ledActivations,
        },
        {
          component: 'Door Unlocked',
          minutes: Number((doorUnlockedSeconds / 60).toFixed(2)),
          activations: doorUnlocks,
        },
        {
          component: 'Buzzer Alarm',
          minutes: Number((buzzerOnSeconds / 60).toFixed(2)),
          activations: 0,
        },
      ],
    };
  }
}
