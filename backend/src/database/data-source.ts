import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Device } from '../devices/entities/device.entity';
import { DeviceState } from '../devices/entities/device-state.entity';
import { Telemetry } from '../telemetry/entities/telemetry.entity';
import { SecurityEvent } from '../events/entities/security-event.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { EmailLog } from '../email/entities/email-log.entity';
import { Setting } from '../settings/entities/setting.entity';
import { Command } from '../commands/entities/command.entity';
import { InitialSchema1700000000000 } from './migrations/1700000000000-InitialSchema';

export const ENTITIES = [
  User,
  Device,
  DeviceState,
  Telemetry,
  SecurityEvent,
  Notification,
  EmailLog,
  Setting,
  Command,
];

export const MIGRATIONS = [InitialSchema1700000000000];

export function buildDataSourceOptions(): DataSourceOptions {
  const dbType = (process.env.DB_TYPE || 'sqlite').toLowerCase();

  if (dbType === 'postgres') {
    return {
      type: 'postgres',
      url: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      entities: ENTITIES,
      migrations: MIGRATIONS,
      synchronize: process.env.DB_SYNCHRONIZE === 'true',
      migrationsRun: process.env.DB_RUN_MIGRATIONS !== 'false',
    };
  }

  const dbPath = process.env.DB_PATH || './data/smartroom.sqlite';
  if (dbPath !== ':memory:') {
    const dir = path.dirname(path.resolve(dbPath));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  return {
    type: 'sqlite',
    database: dbPath,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    migrationsRun: process.env.DB_RUN_MIGRATIONS !== 'false',
  };
}

export const AppDataSource = new DataSource(buildDataSourceOptions());
