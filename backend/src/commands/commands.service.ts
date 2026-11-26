import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { DevicesService } from '../devices/devices.service';
import { EventsService } from '../events/events.service';
import { MqttService } from '../mqtt/mqtt.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SafeUser } from '../users/users.service';
import { Command, CommandType } from './entities/command.entity';

export interface CommandAckPayload {
  commandId: string;
  action: 'UNLOCK' | 'LOCK';
  success: boolean;
  doorUnlocked: boolean;
  reason?: string;
}

@Injectable()
export class CommandsService implements OnModuleDestroy {
  private readonly logger = new Logger(CommandsService.name);
  private readonly activeTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(Command)
    private readonly commandRepo: Repository<Command>,
    private readonly devicesService: DevicesService,
    private readonly eventsService: EventsService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => MqttService))
    private readonly mqttService: MqttService,
  ) {}

  onModuleDestroy(): void {
    for (const timer of this.activeTimers.values()) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();
  }

  async issueDoorCommand(
    idOrDeviceId: string,
    commandType: CommandType,
    user: SafeUser,
    confirmed = true,
  ): Promise<Command> {
    if (commandType === 'UNLOCK' && confirmed === false) {
      throw new BadRequestException('Explicit confirmation is required before unlocking the door');
    }

    const device = await this.devicesService.findOneByIdOrDeviceId(idOrDeviceId);

    // Prevent offline command queuing for security
    if (!device.online || !this.mqttService.isConnected()) {
      const rejected = await this.commandRepo.save(
        this.commandRepo.create({
          deviceId: device.deviceId,
          userId: user.id,
          commandType,
          status: 'REJECTED_OFFLINE',
          expiresAt: new Date(),
          failureReason: !this.mqttService.isConnected()
            ? 'MQTT broker is disconnected'
            : 'Device is offline; remote door commands are disabled',
        }),
      );

      this.realtimeGateway.emitCommandStatus({ command: rejected });
      throw new ConflictException({
        message: rejected.failureReason,
        command: rejected,
      });
    }

    // Deduplicate rapid duplicate clicks while an identical command is already PENDING
    const dedupCutoff = new Date(Date.now() - 2500);
    const existingPending = await this.commandRepo.findOne({
      where: {
        deviceId: device.deviceId,
        commandType,
        status: 'PENDING',
        createdAt: MoreThan(dedupCutoff),
      },
      order: { createdAt: 'DESC' },
    });

    if (existingPending && existingPending.expiresAt.getTime() > Date.now()) {
      return existingPending;
    }

    const timeoutMs =
      this.configService.get<number>('telemetry.commandTimeoutMs') ?? 12000;
    const expiresAt = new Date(Date.now() + timeoutMs);

    const command = await this.commandRepo.save(
      this.commandRepo.create({
        deviceId: device.deviceId,
        userId: user.id,
        commandType,
        status: 'PENDING',
        expiresAt,
        acknowledgedAt: null,
        failureReason: null,
      }),
    );

    this.realtimeGateway.emitCommandStatus({ command });

    try {
      await this.mqttService.publishCommand(device.deviceId, {
        commandId: command.id,
        action: commandType,
        expiresAt: expiresAt.getTime(),
        ttlMs: timeoutMs,
      });
    } catch (err) {
      command.status = 'FAILED';
      command.failureReason =
        err instanceof Error ? err.message : 'Failed to publish MQTT command';
      const failed = await this.commandRepo.save(command);
      this.realtimeGateway.emitCommandStatus({ command: failed });
      throw err;
    }

    // Schedule expiration check
    const timer = setTimeout(() => {
      this.activeTimers.delete(command.id);
      void this.expirePendingCommand(command.id);
    }, timeoutMs);
    this.activeTimers.set(command.id, timer);

    this.logger.log(
      `Issued ${commandType} command ${command.id} for ${device.deviceId} by ${user.email}`,
    );

    return command;
  }

  async expirePendingCommand(commandId: string): Promise<Command | null> {
    const command = await this.commandRepo.findOne({ where: { id: commandId } });
    if (!command || command.status !== 'PENDING') {
      return command;
    }

    command.status = 'TIMEOUT';
    command.failureReason = 'Hardware did not acknowledge command before expiration';
    const saved = await this.commandRepo.save(command);
    this.realtimeGateway.emitCommandStatus({ command: saved });
    this.logger.warn(`Command timed out: ${command.id} (${command.commandType})`);
    return saved;
  }

  async handleCommandAck(deviceId: string, ack: CommandAckPayload): Promise<Command | null> {
    const command = await this.commandRepo.findOne({ where: { id: ack.commandId } });
    if (!command) {
      this.logger.warn(`Received ACK for unknown commandId: ${ack.commandId}`);
      return null;
    }

    if (command.deviceId !== deviceId) {
      this.logger.warn(
        `Rejected ACK for command ${ack.commandId}: deviceId mismatch (${deviceId} != ${command.deviceId})`,
      );
      return null;
    }

    const timer = this.activeTimers.get(command.id);
    if (timer) {
      clearTimeout(timer);
      this.activeTimers.delete(command.id);
    }

    if (command.status !== 'PENDING') {
      this.logger.debug(
        `Ignoring duplicate/late ACK for command ${command.id} (status=${command.status})`,
      );
      return command;
    }

    if (Date.now() > command.expiresAt.getTime()) {
      command.status = 'TIMEOUT';
      command.failureReason = 'Acknowledgment arrived after command expiration';
      const expired = await this.commandRepo.save(command);
      this.realtimeGateway.emitCommandStatus({ command: expired });
      return expired;
    }

    command.acknowledgedAt = new Date();

    if (ack.success) {
      command.status = 'ACKNOWLEDGED';
      command.failureReason = null;
      const saved = await this.commandRepo.save(command);

      const { device, state } = await this.devicesService.updateState(deviceId, {
        doorUnlocked: ack.doorUnlocked,
      });

      this.realtimeGateway.emitDeviceState({ device, state });
      this.realtimeGateway.emitCommandStatus({ command: saved, state });

      const eventType = ack.action === 'UNLOCK' ? 'UNLOCK_REMOTE' : 'DOOR_LOCKED';
      const description =
        ack.action === 'UNLOCK'
          ? `Door unlocked remotely from SmartRoom dashboard (command ${command.id})`
          : `Door locked remotely from SmartRoom dashboard (command ${command.id})`;

      await this.eventsService.recordEvent({
        externalEventId: `cmd-${command.id}`,
        deviceId,
        eventType,
        authenticationMethod: 'REMOTE_WEB',
        severity: 'LOW',
        description,
        doorUnlocked: ack.doorUnlocked,
      });

      this.logger.log(`Command ${command.id} (${ack.action}) acknowledged by ${deviceId}`);
      return saved;
    }

    command.status = 'FAILED';
    command.failureReason = ack.reason || 'Hardware failed to execute command';
    const failed = await this.commandRepo.save(command);
    this.realtimeGateway.emitCommandStatus({ command: failed });
    this.logger.warn(`Command ${command.id} failed on hardware: ${command.failureReason}`);
    return failed;
  }

  async findById(id: string): Promise<Command> {
    const command = await this.commandRepo.findOne({ where: { id } });
    if (!command) {
      throw new NotFoundException(`Command "${id}" not found`);
    }
    return command;
  }

  async findRecent(deviceId?: string, limit = 15): Promise<Command[]> {
    return this.commandRepo.find({
      where: deviceId ? { deviceId } : {},
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
