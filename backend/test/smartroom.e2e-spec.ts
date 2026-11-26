import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { io as ioClient, Socket } from 'socket.io-client';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { CommandsService } from '../src/commands/commands.service';
import { DevicesService } from '../src/devices/devices.service';
import { MqttService } from '../src/mqtt/mqtt.service';
import { Setting } from '../src/settings/entities/setting.entity';
import { User, UserRole } from '../src/users/entities/user.entity';

// Configure isolated in-memory SQLite and disable external MQTT before AppModule loads
process.env.DB_TYPE = 'sqlite';
process.env.DB_PATH = ':memory:';
process.env.DB_SYNCHRONIZE = 'false';
process.env.DB_RUN_MIGRATIONS = 'true';
process.env.MQTT_ENABLED = 'false';
process.env.JWT_SECRET = 'test-suite-jwt-secret-key-min-32-chars';
process.env.TELEMETRY_SAMPLE_INTERVAL_MS = '0';
process.env.DEVICE_OFFLINE_THRESHOLD_SECONDS = '1';
process.env.COMMAND_TIMEOUT_MS = '300';

import { AppModule } from '../src/app.module';

describe('SmartRoom Backend End-to-End Integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let dataSource: DataSource;
  let mqttService: MqttService;
  let commandsService: CommandsService;
  let devicesService: DevicesService;
  let jwtToken: string;

  const adminEmail = 'testadmin@smartroom.local';
  const adminPassword = 'StrongTestPassword123!';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === 'string' ? 3000 : address.port;
    baseUrl = `http://127.0.0.1:${port}`;

    dataSource = moduleRef.get(DataSource);
    mqttService = moduleRef.get(MqttService);
    commandsService = moduleRef.get(CommandsService);
    devicesService = moduleRef.get(DevicesService);

    // Seed test admin + settings into in-memory SQLite
    const userRepo = dataSource.getRepository(User);
    const settingRepo = dataSource.getRepository(Setting);
    const passwordHash = await bcrypt.hash(adminPassword, 4);
    const user = await userRepo.save(
      userRepo.create({
        name: 'Test Admin',
        email: adminEmail,
        passwordHash,
        role: UserRole.ADMIN,
      }),
    );

    await settingRepo.save(
      settingRepo.create({
        userId: user.id,
        recipientEmail: 'alerts@smartroom.local',
        emailEnabled: false,
        wrongPasswordEnabled: true,
        unknownFaceEnabled: true,
        doorUnlockEnabled: false,
        highTemperatureEnabled: true,
        deviceOfflineEnabled: true,
        temperatureThreshold: 35,
        emailCooldown: 60,
        timezone: 'Asia/Kolkata',
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthorized API requests without JWT', async () => {
    await request(app.getHttpServer()).get('/api/devices').expect(401);
    await request(app.getHttpServer()).get('/api/dashboard/overview').expect(401);
    await request(app.getHttpServer()).post('/api/devices/smartroom-01/unlock').expect(401);
  });

  it('rejects invalid login credentials and succeeds for valid admin user', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adminEmail, password: 'WrongPassword!' })
      .expect(401);

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adminEmail, password: adminPassword, rememberMe: true })
      .expect(200);

    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.email).toBe(adminEmail);
    expect(res.body.user.passwordHash).toBeUndefined();
    jwtToken = res.body.accessToken;

    const meRes = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(meRes.body.user.email).toBe(adminEmail);
  });

  it('enforces Socket.IO JWT authentication and emits real-time events to authorized clients', async () => {
    // Unauthorized socket should be disconnected
    await new Promise<void>((resolve, reject) => {
      const badSocket: Socket = ioClient(baseUrl, {
        transports: ['websocket'],
        auth: { token: 'invalid.jwt.token' },
        reconnection: false,
      });
      const timer = setTimeout(() => {
        badSocket.close();
        reject(new Error('Expected unauthorized socket to be disconnected'));
      }, 3000);
      badSocket.on('disconnect', () => {
        clearTimeout(timer);
        badSocket.close();
        resolve();
      });
    });

    // Authorized socket receives telemetry:update when MQTT message arrives
    const receivedTelemetry = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const socket: Socket = ioClient(baseUrl, {
        transports: ['websocket'],
        auth: { token: jwtToken },
        reconnection: false,
      });

      const timer = setTimeout(() => {
        socket.close();
        reject(new Error('Timed out waiting for telemetry:update Socket.IO event'));
      }, 4000);

      socket.on('connect', async () => {
        await mqttService.handleIncomingMessage(
          'smartroom/smartroom-01/telemetry',
          JSON.stringify({
            deviceId: 'smartroom-01',
            temperature: 29.5,
            distance: 18.2,
            fan: true,
            led: true,
            doorUnlocked: false,
            buzzer: false,
          }),
        );
      });

      socket.on('telemetry:update', (payload: Record<string, unknown>) => {
        clearTimeout(timer);
        socket.close();
        resolve(payload);
      });
    });

    expect(receivedTelemetry.deviceId).toBe('smartroom-01');
  });

  it('persists MQTT telemetry, ignores malformed MQTT payloads, and deduplicates security events', async () => {
    // Malformed JSON and invalid fields should not throw or overwrite temperature
    await mqttService.handleIncomingMessage('smartroom/smartroom-01/telemetry', '{bad-json');
    await mqttService.handleIncomingMessage(
      'smartroom/smartroom-01/telemetry',
      JSON.stringify({ deviceId: 'smartroom-01', temperature: 9999 }),
    );

    const latestRes = await request(app.getHttpServer())
      .get('/api/telemetry/latest')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(latestRes.body.state.temperature).toBe(29.5);
    expect(latestRes.body.state.fanState).toBe(true);

    // Send duplicate externalEventId twice
    const eventPayload = JSON.stringify({
      eventId: 'evt-unique-999',
      deviceId: 'smartroom-01',
      event: 'WRONG_PASSWORD',
      severity: 'HIGH',
      message: 'Incorrect keypad password detected',
    });

    await mqttService.handleIncomingMessage('smartroom/smartroom-01/events', eventPayload);
    await mqttService.handleIncomingMessage('smartroom/smartroom-01/events', eventPayload);

    const eventsRes = await request(app.getHttpServer())
      .get('/api/events?eventType=WRONG_PASSWORD')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    const matching = eventsRes.body.items.filter(
      (e: { externalEventId: string }) => e.externalEventId === 'evt-unique-999',
    );
    expect(matching).toHaveLength(1);
    expect(matching[0].authenticationMethod).toBe('KEYPAD');
  });

  it('handles remote command creation, acknowledgment, expiration, and offline rejection', async () => {
    // Mock MQTT publishCommand and isConnected for online hardware command test
    jest.spyOn(mqttService, 'isConnected').mockReturnValue(true);
    const publishSpy = jest
      .spyOn(mqttService, 'publishCommand')
      .mockResolvedValue(undefined);

    await devicesService.markOnline('smartroom-01', '1.0.0');

    const unlockRes = await request(app.getHttpServer())
      .post('/api/devices/smartroom-01/unlock')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ confirmed: true })
      .expect(201);

    const commandId = unlockRes.body.id;
    expect(unlockRes.body.status).toBe('PENDING');
    expect(publishSpy).toHaveBeenCalledWith(
      'smartroom-01',
      expect.objectContaining({ commandId, action: 'UNLOCK' }),
    );

    // Door must remain locked until hardware ACK arrives
    const beforeAck = await request(app.getHttpServer())
      .get('/api/devices/smartroom-01/status')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(beforeAck.body.state.doorUnlocked).toBe(false);

    // Hardware sends valid ACK via MQTT
    await mqttService.handleIncomingMessage(
      'smartroom/smartroom-01/ack',
      JSON.stringify({
        commandId,
        action: 'UNLOCK',
        success: true,
        doorUnlocked: true,
      }),
    );

    const cmdAfterAck = await request(app.getHttpServer())
      .get(`/api/commands/${commandId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(cmdAfterAck.body.status).toBe('ACKNOWLEDGED');

    const afterAck = await request(app.getHttpServer())
      .get('/api/devices/smartroom-01/status')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(afterAck.body.state.doorUnlocked).toBe(true);

    // Command expiration test (COMMAND_TIMEOUT_MS = 300ms)
    const lockRes = await request(app.getHttpServer())
      .post('/api/devices/smartroom-01/lock')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ confirmed: true })
      .expect(201);

    await new Promise((r) => setTimeout(r, 450));

    const expiredCmd = await commandsService.findById(lockRes.body.id);
    expect(expiredCmd.status).toBe('TIMEOUT');

    // Offline detection marks device offline after threshold
    await new Promise((r) => setTimeout(r, 1100));
    await mqttService.checkOfflineDevices();

    const offlineDevice = await devicesService.findOneByIdOrDeviceId('smartroom-01');
    expect(offlineDevice.online).toBe(false);

    // Offline unlock attempt must be rejected (409) and never queued
    await request(app.getHttpServer())
      .post('/api/devices/smartroom-01/unlock')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ confirmed: true })
      .expect(409);

    publishSpy.mockRestore();
  });
});
