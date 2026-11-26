import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from './data-source';
import { User, UserRole } from '../users/entities/user.entity';
import { Setting } from '../settings/entities/setting.entity';

function parseArg(flag: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1].trim();
  }
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? eq.slice(flag.length + 1).trim() : '';
}

async function main() {
  const email = parseArg('--email').toLowerCase();
  const password = parseArg('--password');
  const name = parseArg('--name') || 'SmartRoom User';

  if (!email || !email.includes('@')) {
    console.error('Usage: npm run create-user -- --email user@example.com --password YourPassword --name "Full Name"');
    process.exit(1);
  }
  if (!password || password.length < 6) {
    console.error('Error: --password must be at least 6 characters long.');
    process.exit(1);
  }

  await AppDataSource.initialize();
  await AppDataSource.runMigrations();

  const userRepo = AppDataSource.getRepository(User);
  const settingRepo = AppDataSource.getRepository(Setting);
  const passwordHash = await bcrypt.hash(password, 12);

  let user = await userRepo.findOne({ where: { email } });
  if (user) {
    user.passwordHash = passwordHash;
    if (parseArg('--name')) user.name = name;
    user = await userRepo.save(user);
    console.log(`[User] Updated password for existing account: ${email}`);
  } else {
    user = await userRepo.save(
      userRepo.create({
        name,
        email,
        passwordHash,
        role: UserRole.ADMIN,
      }),
    );
    console.log(`[User] Created new admin account: ${email}`);
  }

  const existingSetting = await settingRepo.findOne({ where: { userId: user.id } });
  if (!existingSetting) {
    await settingRepo.save(
      settingRepo.create({
        userId: user.id,
        recipientEmail: email,
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
    console.log(`[User] Created notification settings for: ${email}`);
  }

  await AppDataSource.destroy();
}

main().catch(async (err) => {
  console.error('[User] Error:', err instanceof Error ? err.message : err);
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
  process.exit(1);
});
