import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as mqtt from 'mqtt';
import { CommandsService } from '../commands/commands.service';
import { DevicesService } from '../devices/devices.service';
import { EventsService } from '../events/events.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SettingsService } from '../settings/settings.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import {
  validateAckPayload,
  validateEventPayload,
  validateTelemetryPayload,
} from './dto/mqtt-payloads';

interface DeviceRuntimeTracker {
  lastBuzzerState?: boolean;
  lastFanState?: boolean;
  lastLedState?: boolean;
  highTempActive: boolean;
  offlineAlertSent: boolean;
}

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: mqtt.MqttClient | null = null;
  private connected = false;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private readonly runtimeState = new Map<string, DeviceRuntimeTracker>();
  private readonly deviceQueues = new Map<string, Promise<void>>();

  constructor(
    private readonly configService: ConfigService,
    private readonly devicesService: DevicesService,
    private readonly telemetryService: TelemetryService,
    private readonly eventsService: EventsService,
    private readonly settingsService: SettingsService,
    private readonly realtimeGateway: RealtimeGateway,
    @Inject(forwardRef(() => CommandsService))
    private readonly commandsService: CommandsService,
  ) {}

  onModuleInit(): void {
    const enabled = this.configService.get<boolean>('mqtt.enabled') ?? true;
    if (enabled) {
      this.connect();
    } else {
      this.logger.warn('MQTT client disabled via MQTT_ENABLED=false');
    }

    // Periodically check for silent/disconnected devices
    this.watchdogTimer = setInterval(() => {
      void this.checkOfflineDevices();
    }, 5000);
  }

  onModuleDestroy(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.client) {
      this.client.end(true);
      this.client = null;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private getTracker(deviceId: string): DeviceRuntimeTracker {
    let tracker = this.runtimeState.get(deviceId);
    if (!tracker) {
      tracker = {
        highTempActive: false,
        offlineAlertSent: false,
      };
      this.runtimeState.set(deviceId, tracker);
    }
    return tracker;
  }

  private connect(): void {
    const brokerUrl =
      this.configService.get<string>('mqtt.brokerUrl') || 'mqtt://localhost:1883';
    const username = this.configService.get<string>('mqtt.username') || undefined;
    const password = this.configService.get<string>('mqtt.password') || undefined;
    const clientId =
      this.configService.get<string>('mqtt.clientId') ||
      `smartroom-backend-${Math.random().toString(16).slice(2, 8)}`;
    const caPath = this.configService.get<string>('mqtt.caPath');
    const rejectUnauthorized =
      this.configService.get<boolean>('mqtt.rejectUnauthorized') ?? true;

    const options: mqtt.IClientOptions = {
      clientId,
      username,
      password,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      rejectUnauthorized,
    };

    if (caPath && fs.existsSync(caPath)) {
      options.ca = fs.readFileSync(caPath);
    }

    this.logger.log(`Connecting to MQTT broker at ${brokerUrl}...`);
    this.client = mqtt.connect(brokerUrl, options);

    this.client.on('connect', () => {
      this.connected = true;
      this.logger.log('Connected to Mosquitto MQTT broker');

      const topics = [
        'smartroom/+/telemetry',
        'smartroom/+/state',
        'smartroom/+/events',
        'smartroom/+/ack',
        'smartroom/+/availability',
      ];

      this.client?.subscribe(topics, { qos: 1 }, (err) => {
        if (err) {
          this.logger.error(`MQTT subscribe error: ${err.message}`);
        } else {
          this.logger.log(`Subscribed to MQTT topics: ${topics.join(', ')}`);
        }
      });
    });

    this.client.on('reconnect', () => {
      this.logger.warn('Attempting MQTT broker reconnection...');
    });

    this.client.on('offline', () => {
      this.connected = false;
      this.logger.warn('MQTT client is offline');
    });

    this.client.on('error', (err) => {
      this.connected = false;
      this.logger.error(`MQTT error: ${err.message}`);
    });

    this.client.on('message', (topic, payloadBuffer) => {
      const deviceId = topic.split('/')[1] || 'global';
      const prev = this.deviceQueues.get(deviceId) || Promise.resolve();
      const next = prev
        .then(() => this.handleIncomingMessage(topic, payloadBuffer.toString('utf8')))
        .catch((err) => {
          this.logger.error(
            `Error handling MQTT message on ${topic}: ${err instanceof Error ? err.message : err}`,
          );
        });
      this.deviceQueues.set(deviceId, next);
    });
  }

  async publishCommand(
    deviceId: string,
    payload: { commandId: string; action: 'UNLOCK' | 'LOCK'; expiresAt: number; ttlMs?: number },
  ): Promise<void> {
    if (!this.client || !this.connected) {
      throw new ServiceUnavailableException('MQTT broker is not connected');
    }

    const topic = `smartroom/${deviceId}/commands`;
    const body = JSON.stringify(payload);

    await new Promise<void>((resolve, reject) => {
      this.client!.publish(
        topic,
        body,
        { qos: 1, retain: false }, // Never retain unlock/lock commands
        (err) => {
          if (err) return reject(err);
          resolve();
        },
      );
    });
  }

  private publishEventAck(deviceId: string, eventId: string): void {
    if (!this.client || !this.connected) return;
    const topic = `smartroom/${deviceId}/events/ack`;
    this.client.publish(topic, JSON.stringify({ eventId }), { qos: 0, retain: false });
  }

  /**
   * Public entry point also usable by automated unit/integration tests without a live broker.
   */
  async handleIncomingMessage(topic: string, rawPayload: string): Promise<void> {
    const parts = topic.split('/');
    if (parts.length !== 3 || parts[0] !== 'smartroom' || !parts[1]) {
      this.logger.warn(`Ignoring unexpected MQTT topic: ${topic}`);
      return;
    }

    const deviceId = parts[1];
    const channel = parts[2];

    if (channel === 'availability') {
      await this.handleAvailability(deviceId, rawPayload);
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawPayload);
    } catch {
      this.logger.warn(`Rejected malformed JSON on ${topic}`);
      return;
    }

    switch (channel) {
      case 'telemetry':
      case 'state':
        await this.handleTelemetry(deviceId, parsed);
        break;
      case 'events':
        await this.handleEvent(deviceId, parsed);
        break;
      case 'ack':
        await this.handleAck(deviceId, parsed);
        break;
      default:
        this.logger.warn(`Unhandled MQTT channel "${channel}" on ${topic}`);
    }
  }

  private async handleAvailability(deviceId: string, rawPayload: string): Promise<void> {
    let online = false;
    let firmwareVersion: string | null = null;
    const trimmed = rawPayload.trim();

    if (trimmed === 'online') {
      online = true;
    } else if (trimmed === 'offline') {
      online = false;
    } else {
      try {
        const obj = JSON.parse(trimmed) as Record<string, unknown>;
        if (typeof obj.online !== 'boolean') {
          this.logger.warn(`Invalid availability payload for ${deviceId}`);
          return;
        }
        online = obj.online;
        if (typeof obj.firmwareVersion === 'string') {
          firmwareVersion = obj.firmwareVersion.slice(0, 64);
        }
      } catch {
        this.logger.warn(`Malformed availability payload for ${deviceId}`);
        return;
      }
    }

    const tracker = this.getTracker(deviceId);

    if (online) {
      const existing = await this.devicesService.findOneByIdOrDeviceId(deviceId).catch(() => null);
      const wasOffline = !existing || !existing.online;
      const device = await this.devicesService.markOnline(deviceId, firmwareVersion);
      tracker.offlineAlertSent = false;

      const simPrefix = deviceId.includes('-sim') ? '[SIMULATOR] ' : '';

      if (wasOffline) {
        this.realtimeGateway.emitDeviceOnline({ device });
        await this.eventsService.recordEvent({
          deviceId,
          eventType: 'DEVICE_ONLINE',
          authenticationMethod: 'SYSTEM',
          severity: 'LOW',
          description: `${simPrefix}Hardware node ${device.name} (${deviceId}) connected to MQTT broker`,
        });
      }
    } else {
      const simPrefix = deviceId.includes('-sim') ? '[SIMULATOR] ' : '';
      await this.triggerDeviceOffline(
        deviceId,
        `${simPrefix}Hardware node ${deviceId} disconnected (MQTT Last Will and Testament)`,
      );
    }
  }

  private async handleTelemetry(deviceId: string, parsed: unknown): Promise<void> {
    const valid = validateTelemetryPayload(parsed, deviceId);
    if (!valid) {
      this.logger.warn(`Rejected invalid telemetry payload for ${deviceId}`);
      return;
    }

    const tracker = this.getTracker(deviceId);
    tracker.offlineAlertSent = false;

    const { device, state, becameOnline } = await this.devicesService.updateState(
      deviceId,
      {
        temperature: valid.temperature,
        distance: valid.distance,
        fanState: valid.fan,
        ledState: valid.led,
        doorUnlocked: valid.doorUnlocked,
        buzzerState: valid.buzzer,
      },
      valid.firmwareVersion,
    );

    if (becameOnline) {
      this.realtimeGateway.emitDeviceOnline({ device });
    }

    await this.telemetryService.recordSampleIfDue(deviceId, {
      temperature: valid.temperature,
      distance: valid.distance,
      fanState: valid.fan,
      ledState: valid.led,
      doorUnlocked: valid.doorUnlocked,
      buzzerState: valid.buzzer,
    });

    this.realtimeGateway.emitTelemetryUpdate({
      deviceId,
      device,
      state,
      stale: false,
      receivedAt: new Date().toISOString(),
    });
    this.realtimeGateway.emitDeviceState({ device, state });

    if (tracker.lastBuzzerState !== undefined && tracker.lastBuzzerState !== valid.buzzer) {
      this.realtimeGateway.emitBuzzerState({
        deviceId,
        buzzerState: valid.buzzer,
        updatedAt: new Date().toISOString(),
      });
    }
    tracker.lastBuzzerState = valid.buzzer;

    const simPrefix = deviceId.includes('-sim') ? '[SIMULATOR] ' : '';

    // Track discrete fan / LED toggle changes in activity history
    if (tracker.lastFanState !== undefined && tracker.lastFanState !== valid.fan) {
      await this.eventsService.recordEvent({
        deviceId,
        eventType: valid.fan ? 'FAN_ON' : 'FAN_OFF',
        authenticationMethod: 'ULTRASONIC',
        severity: 'LOW',
        description: `${simPrefix}DC fan turned ${valid.fan ? 'ON' : 'OFF'} via ultrasonic gesture control`,
        doorUnlocked: valid.doorUnlocked,
      });
    }
    tracker.lastFanState = valid.fan;

    if (tracker.lastLedState !== undefined && tracker.lastLedState !== valid.led) {
      await this.eventsService.recordEvent({
        deviceId,
        eventType: valid.led ? 'LED_ON' : 'LED_OFF',
        authenticationMethod: 'ULTRASONIC',
        severity: 'LOW',
        description: `${simPrefix}Room LED turned ${valid.led ? 'ON' : 'OFF'} via ultrasonic gesture control`,
        doorUnlocked: valid.doorUnlocked,
      });
    }
    tracker.lastLedState = valid.led;

    // High-temperature threshold with 1.5°C hysteresis
    const setting = await this.settingsService.getPrimaryAlertSetting();
    const threshold = setting?.temperatureThreshold ?? 35.0;
    const hysteresis = 1.5;

    if (!tracker.highTempActive && valid.temperature >= threshold) {
      tracker.highTempActive = true;
      await this.eventsService.recordEvent({
        deviceId,
        eventType: 'HIGH_TEMPERATURE',
        authenticationMethod: 'SYSTEM',
        severity: 'MEDIUM',
        description: `${simPrefix}Room temperature (${valid.temperature.toFixed(1)} °C) exceeded threshold (${threshold.toFixed(1)} °C)`,
        doorUnlocked: valid.doorUnlocked,
        temperature: valid.temperature,
        threshold,
      });
    } else if (tracker.highTempActive && valid.temperature <= threshold - hysteresis) {
      tracker.highTempActive = false;
    }
  }

  private async handleEvent(deviceId: string, parsed: unknown): Promise<void> {
    const valid = validateEventPayload(parsed, deviceId);
    if (!valid) {
      this.logger.warn(`Rejected invalid event payload for ${deviceId}`);
      return;
    }

    const tracker = this.getTracker(deviceId);
    tracker.offlineAlertSent = false;

    const deviceUpdatePatch: Partial<{
      doorUnlocked: boolean;
      ledState: boolean;
      buzzerState: boolean;
    }> = {};

    if (
      valid.event === 'UNLOCK_PASSWORD' ||
      valid.event === 'UNLOCK_FACE' ||
      valid.event === 'UNLOCK_REMOTE' ||
      valid.event === 'UNLOCK_BLYNK'
    ) {
      deviceUpdatePatch.doorUnlocked = true;
      deviceUpdatePatch.buzzerState = false;
    } else if (valid.event === 'DOOR_LOCKED') {
      deviceUpdatePatch.doorUnlocked = false;
    } else if (valid.event === 'LED_ON') {
      deviceUpdatePatch.ledState = true;
    } else if (valid.event === 'LED_OFF') {
      deviceUpdatePatch.ledState = false;
    } else if (valid.event === 'WRONG_PASSWORD' || valid.event === 'UNKNOWN_FACE' || valid.event === 'BUZZER_ON') {
      deviceUpdatePatch.buzzerState = true;
    } else if (valid.event === 'BUZZER_OFF') {
      deviceUpdatePatch.buzzerState = false;
    }

    const { device, state, becameOnline } = await this.devicesService.updateState(
      deviceId,
      deviceUpdatePatch,
    );

    if (becameOnline) {
      this.realtimeGateway.emitDeviceOnline({ device });
    }
    this.realtimeGateway.emitDeviceState({ device, state });

    if (deviceUpdatePatch.buzzerState !== undefined) {
      tracker.lastBuzzerState = deviceUpdatePatch.buzzerState;
      this.realtimeGateway.emitBuzzerState({
        deviceId,
        buzzerState: deviceUpdatePatch.buzzerState,
        updatedAt: new Date().toISOString(),
      });
    }

    const mappedEventType = valid.event === 'UNLOCK_BLYNK' ? 'UNLOCK_REMOTE' : valid.event;

    await this.eventsService.recordEvent({
      externalEventId: valid.eventId || null,
      deviceId,
      eventType: mappedEventType,
      severity: valid.severity,
      description: valid.message,
      doorUnlocked: state.doorUnlocked,
    });

    // Application-level ACK for QoS-0 PubSubClient reliable delivery
    if (valid.eventId) {
      this.publishEventAck(deviceId, valid.eventId);
    }
  }

  private async handleAck(deviceId: string, parsed: unknown): Promise<void> {
    const valid = validateAckPayload(parsed);
    if (!valid) {
      this.logger.warn(`Rejected invalid command ACK payload for ${deviceId}`);
      return;
    }

    await this.commandsService.handleCommandAck(deviceId, valid);
  }

  async checkOfflineDevices(): Promise<void> {
    const offlineThresholdSec =
      this.configService.get<number>('telemetry.offlineThresholdSeconds') ?? 25;
    const onlineDevices = await this.devicesService.findOnlineDevices();
    const now = Date.now();

    for (const device of onlineDevices) {
      if (!device.lastSeen) continue;
      const elapsedMs = now - new Date(device.lastSeen).getTime();
      if (elapsedMs > offlineThresholdSec * 1000) {
        await this.triggerDeviceOffline(
          device.deviceId,
          `No heartbeat or telemetry received from ${device.name} (${device.deviceId}) for over ${offlineThresholdSec}s`,
        );
      }
    }
  }

  private async triggerDeviceOffline(deviceId: string, reason: string): Promise<void> {
    const existing = await this.devicesService.findOneByIdOrDeviceId(deviceId).catch(() => null);
    const tracker = this.getTracker(deviceId);

    const wasOnline = existing?.online ?? false;
    const updatedDevice = await this.devicesService.markOffline(deviceId);

    if (wasOnline) {
      this.realtimeGateway.emitDeviceOffline({
        device: updatedDevice,
        reason,
      });
    }

    if (!tracker.offlineAlertSent && wasOnline) {
      tracker.offlineAlertSent = true;
      await this.eventsService.recordEvent({
        deviceId,
        eventType: 'DEVICE_OFFLINE',
        authenticationMethod: 'SYSTEM',
        severity: 'HIGH',
        description: reason,
        lastSeen: existing?.lastSeen || null,
        doorUnlocked: existing?.state?.doorUnlocked ?? false,
      });
    }
  }
}
