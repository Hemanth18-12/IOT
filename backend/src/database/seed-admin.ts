import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from './data-source';
import { User, UserRole } from '../users/entities/user.entity';
import { Device } from '../devices/entities/device.entity';
import { DeviceState } from '../devices/entities/device-state.entity';
import { Setting } from '../settings/entities/setting.entity';

export async function runSeed(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  await AppDataSource.runMigrations();

  const userRepo = AppDataSource.getRepository(User);
  const deviceRepo = AppDataSource.getRepository(Device);
  const stateRepo = AppDataSource.getRepository(DeviceState);
  const settingRepo = AppDataSource.getRepository(Setting);

  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@smartroom.local').trim().toLowerCase();
  const adminName = (process.env.ADMIN_NAME || 'SmartRoom Admin').trim();
  const adminPassword = process.env.ADMIN_PASSWORD || '';

  if (!adminPassword || adminPassword.length < 8) {
    throw new Error(
      'ADMIN_PASSWORD must be set in backend/.env and be at least 8 characters long before seeding.',
    );
  }

  let user = await userRepo.findOne({ where: { email: adminEmail } });
  if (!user) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    user = userRepo.create({
      name: adminName,
      email: adminEmail,
      passwordHash,
      role: UserRole.ADMIN,
    });
    user = await userRepo.save(user);
    console.log(`[Seed] Created admin account: ${adminEmail}`);
  } else {
    console.log(`[Seed] Admin account already exists: ${adminEmail}`);
  }

  const rawDefaultAlert = (process.env.DEFAULT_ALERT_EMAIL || '').trim();
  const isValidDefaultAlert =
    rawDefaultAlert.includes('@') &&
    !rawDefaultAlert.toLowerCase().includes('example.com') &&
    !rawDefaultAlert.toLowerCase().includes('my_recipient');
  const resolvedRecipient = isValidDefaultAlert ? rawDefaultAlert : adminEmail;

  const existingSetting = await settingRepo.findOne({ where: { userId: user.id } });
  if (!existingSetting) {
    await settingRepo.save(
      settingRepo.create({
        userId: user.id,
        recipientEmail: resolvedRecipient,
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
    console.log(`[Seed] Created default notification settings for: ${adminEmail}`);
  } else if (!existingSetting.recipientEmail.includes('@')) {
    existingSetting.recipientEmail = resolvedRecipient;
    await settingRepo.save(existingSetting);
    console.log(`[Seed] Repaired placeholder recipientEmail to: ${resolvedRecipient}`);
  }

  const defaultDeviceId = process.env.DEFAULT_DEVICE_ID || 'smartroom-01';
  const defaultDeviceName = process.env.DEFAULT_DEVICE_NAME || 'SmartRoom Primary Node';

  let device = await deviceRepo.findOne({ where: { deviceId: defaultDeviceId } });
  if (!device) {
    device = await deviceRepo.save(
      deviceRepo.create({
        deviceId: defaultDeviceId,
        name: defaultDeviceName,
        online: false,
        lastSeen: null,
        firmwareVersion: null,
      }),
    );
    console.log(`[Seed] Registered default hardware device: ${defaultDeviceId}`);
  }

  const state = await stateRepo.findOne({ where: { deviceId: defaultDeviceId } });
  if (!state) {
    await stateRepo.save(
      stateRepo.create({
        deviceId: defaultDeviceId,
        temperature: null,
        distance: null,
        fanState: false,
        ledState: false,
        doorUnlocked: false,
        buzzerState: false,
        updatedAt: new Date(),
      }),
    );
    console.log(`[Seed] Initialized device state for: ${defaultDeviceId}`);
  }
}

if (require.main === module) {
  runSeed()
    .then(async () => {
      await AppDataSource.destroy();
      console.log('[Seed] Database initialization complete.');
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[Seed] Error:', err instanceof Error ? err.message : err);
      if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
      }
      process.exit(1);
    });
}
