import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from './entities/device.entity';
import { DeviceState } from './entities/device-state.entity';

export interface DeviceWithState {
  id: string;
  deviceId: string;
  name: string;
  online: boolean;
  lastSeen: Date | null;
  firmwareVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
  stale: boolean;
  state: DeviceState | null;
}

@Injectable()
export class DevicesService implements OnModuleInit {
  private readonly logger = new Logger(DevicesService.name);
  private readonly ensureLocks = new Map<string, Promise<Device>>();

  constructor(
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
    @InjectRepository(DeviceState)
    private readonly stateRepo: Repository<DeviceState>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaultDevice();
  }

  async ensureDefaultDevice(): Promise<Device> {
    const deviceId = this.configService.get<string>('defaultDevice.deviceId') || 'smartroom-01';
    const name =
      this.configService.get<string>('defaultDevice.name') || 'SmartRoom Primary Node';
    return this.ensureDeviceExists(deviceId, name);
  }

  async ensureDeviceExists(deviceId: string, defaultName?: string): Promise<Device> {
    const pending = this.ensureLocks.get(deviceId);
    if (pending) {
      return pending;
    }

    const work = this.ensureDeviceExistsInternal(deviceId, defaultName).finally(() => {
      this.ensureLocks.delete(deviceId);
    });
    this.ensureLocks.set(deviceId, work);
    return work;
  }

  private async ensureDeviceExistsInternal(
    deviceId: string,
    defaultName?: string,
  ): Promise<Device> {
    let device = await this.deviceRepo.findOne({ where: { deviceId } });
    if (!device) {
      const resolvedName =
        defaultName ||
        (deviceId.includes('-sim')
          ? `SmartRoom Simulator (${deviceId})`
          : `SmartRoom (${deviceId})`);
      try {
        device = await this.deviceRepo.save(
          this.deviceRepo.create({
            deviceId,
            name: resolvedName,
            online: false,
            lastSeen: null,
            firmwareVersion: null,
          }),
        );
        this.logger.log(`Registered hardware device: ${deviceId}`);
      } catch {
        device = await this.deviceRepo.findOne({ where: { deviceId } });
        if (!device) {
          throw new Error(`Failed to register or retrieve device "${deviceId}"`);
        }
      }
    }

    const state = await this.stateRepo.findOne({ where: { deviceId } });
    if (!state) {
      try {
        await this.stateRepo.save(
          this.stateRepo.create({
            deviceId,
            temperature: null,
            distance: null,
            fanState: false,
            ledState: false,
            doorUnlocked: false,
            buzzerState: false,
            updatedAt: new Date(),
          }),
        );
      } catch {
        // Ignore concurrent initial state insertion
      }
    }

    return device;
  }

  isDataStale(device: Device, state: DeviceState | null): boolean {
    if (!device.online) return true;
    const staleSec = this.configService.get<number>('telemetry.staleSeconds') || 20;
    const reference = state?.updatedAt || device.lastSeen;
    if (!reference) return true;
    return Date.now() - new Date(reference).getTime() > staleSec * 1000;
  }

  private async attachState(device: Device): Promise<DeviceWithState> {
    const state = await this.stateRepo.findOne({ where: { deviceId: device.deviceId } });
    return {
      ...device,
      stale: this.isDataStale(device, state),
      state,
    };
  }

  async findAll(): Promise<DeviceWithState[]> {
    const devices = await this.deviceRepo.find({ order: { createdAt: 'ASC' } });
    return Promise.all(devices.map((d) => this.attachState(d)));
  }

  async findOneByIdOrDeviceId(idOrDeviceId: string): Promise<DeviceWithState> {
    const device =
      (await this.deviceRepo.findOne({ where: { deviceId: idOrDeviceId } })) ||
      (await this.deviceRepo.findOne({ where: { id: idOrDeviceId } }));
    if (!device) {
      throw new NotFoundException(`Device "${idOrDeviceId}" not found`);
    }
    return this.attachState(device);
  }

  async getDefaultDevice(): Promise<DeviceWithState> {
    const defaultId = this.configService.get<string>('defaultDevice.deviceId') || 'smartroom-01';
    const existing = await this.deviceRepo.findOne({ where: { deviceId: defaultId } });
    if (existing) {
      return this.attachState(existing);
    }
    const created = await this.ensureDefaultDevice();
    return this.attachState(created);
  }

  async updateDeviceName(deviceId: string, name: string): Promise<Device> {
    const device = await this.ensureDeviceExists(deviceId);
    device.name = name.trim();
    return this.deviceRepo.save(device);
  }

  async markOnline(deviceId: string, firmwareVersion?: string | null): Promise<Device> {
    const device = await this.ensureDeviceExists(deviceId);
    device.online = true;
    device.lastSeen = new Date();
    if (firmwareVersion) {
      device.firmwareVersion = firmwareVersion;
    }
    return this.deviceRepo.save(device);
  }

  async markOffline(deviceId: string): Promise<Device> {
    const device = await this.ensureDeviceExists(deviceId);
    device.online = false;
    return this.deviceRepo.save(device);
  }

  async updateState(
    deviceId: string,
    patch: Partial<{
      temperature: number | null;
      distance: number | null;
      fanState: boolean;
      ledState: boolean;
      doorUnlocked: boolean;
      buzzerState: boolean;
    }>,
    firmwareVersion?: string | null,
  ): Promise<{ device: Device; state: DeviceState; becameOnline: boolean }> {
    const device = await this.ensureDeviceExists(deviceId);
    const becameOnline = !device.online;

    device.online = true;
    device.lastSeen = new Date();
    if (firmwareVersion) {
      device.firmwareVersion = firmwareVersion;
    }
    const savedDevice = await this.deviceRepo.save(device);

    let state = await this.stateRepo.findOne({ where: { deviceId } });
    if (!state) {
      state = this.stateRepo.create({
        deviceId,
        temperature: null,
        distance: null,
        fanState: false,
        ledState: false,
        doorUnlocked: false,
        buzzerState: false,
        updatedAt: new Date(),
      });
    }

    if (patch.temperature !== undefined) state.temperature = patch.temperature;
    if (patch.distance !== undefined) state.distance = patch.distance;
    if (patch.fanState !== undefined) state.fanState = patch.fanState;
    if (patch.ledState !== undefined) state.ledState = patch.ledState;
    if (patch.doorUnlocked !== undefined) state.doorUnlocked = patch.doorUnlocked;
    if (patch.buzzerState !== undefined) state.buzzerState = patch.buzzerState;
    state.updatedAt = new Date();

    const savedState = await this.stateRepo.save(state);
    return { device: savedDevice, state: savedState, becameOnline };
  }

  async findOnlineDevices(): Promise<Device[]> {
    return this.deviceRepo.find({ where: { online: true } });
  }
}
