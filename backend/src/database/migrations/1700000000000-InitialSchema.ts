import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';
import { dateColumnType } from '../column-types';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dt = dateColumnType();

    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'name', type: 'varchar', length: '120' },
          { name: 'email', type: 'varchar', length: '255', isUnique: true },
          { name: 'passwordHash', type: 'varchar', length: '255' },
          { name: 'role', type: 'varchar', length: '32', default: `'ADMIN'` },
          { name: 'createdAt', type: dt, default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: dt, default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'devices',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'deviceId', type: 'varchar', length: '64', isUnique: true },
          { name: 'name', type: 'varchar', length: '120' },
          { name: 'online', type: 'boolean', default: false },
          { name: 'lastSeen', type: dt, isNullable: true },
          { name: 'firmwareVersion', type: 'varchar', length: '64', isNullable: true },
          { name: 'createdAt', type: dt, default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: dt, default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'device_states',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'deviceId', type: 'varchar', length: '64', isUnique: true },
          { name: 'temperature', type: 'float', isNullable: true },
          { name: 'distance', type: 'float', isNullable: true },
          { name: 'fanState', type: 'boolean', default: false },
          { name: 'ledState', type: 'boolean', default: false },
          { name: 'doorUnlocked', type: 'boolean', default: false },
          { name: 'buzzerState', type: 'boolean', default: false },
          { name: 'updatedAt', type: dt },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'telemetry',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'deviceId', type: 'varchar', length: '64' },
          { name: 'temperature', type: 'float' },
          { name: 'distance', type: 'float' },
          { name: 'fanState', type: 'boolean', default: false },
          { name: 'ledState', type: 'boolean', default: false },
          { name: 'doorUnlocked', type: 'boolean', default: false },
          { name: 'buzzerState', type: 'boolean', default: false },
          { name: 'timestamp', type: dt },
        ],
      }),
      true,
    );

    await queryRunner.createIndices('telemetry', [
      new TableIndex({ name: 'idx_telemetry_device_id', columnNames: ['deviceId'] }),
      new TableIndex({ name: 'idx_telemetry_timestamp', columnNames: ['timestamp'] }),
      new TableIndex({
        name: 'idx_telemetry_device_timestamp',
        columnNames: ['deviceId', 'timestamp'],
      }),
    ]);

    await queryRunner.createTable(
      new Table({
        name: 'security_events',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'externalEventId', type: 'varchar', length: '128', isUnique: true, isNullable: true },
          { name: 'deviceId', type: 'varchar', length: '64' },
          { name: 'eventType', type: 'varchar', length: '64' },
          { name: 'authenticationMethod', type: 'varchar', length: '64', isNullable: true },
          { name: 'severity', type: 'varchar', length: '16' },
          { name: 'description', type: 'text' },
          { name: 'timestamp', type: dt },
        ],
      }),
      true,
    );

    await queryRunner.createIndices('security_events', [
      new TableIndex({ name: 'idx_security_events_device_id', columnNames: ['deviceId'] }),
      new TableIndex({ name: 'idx_security_events_event_type', columnNames: ['eventType'] }),
      new TableIndex({ name: 'idx_security_events_severity', columnNames: ['severity'] }),
      new TableIndex({ name: 'idx_security_events_timestamp', columnNames: ['timestamp'] }),
      new TableIndex({
        name: 'idx_security_events_device_timestamp',
        columnNames: ['deviceId', 'timestamp'],
      }),
    ]);

    await queryRunner.createTable(
      new Table({
        name: 'notifications',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'userId', type: 'varchar', length: '36' },
          { name: 'eventId', type: 'varchar', length: '36', isNullable: true },
          { name: 'eventType', type: 'varchar', length: '64', default: `'SYSTEM'` },
          { name: 'title', type: 'varchar', length: '160' },
          { name: 'message', type: 'text' },
          { name: 'severity', type: 'varchar', length: '16' },
          { name: 'isRead', type: 'boolean', default: false },
          { name: 'createdAt', type: dt, default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createIndices('notifications', [
      new TableIndex({ name: 'idx_notifications_user_id', columnNames: ['userId'] }),
      new TableIndex({ name: 'idx_notifications_user_read', columnNames: ['userId', 'isRead'] }),
      new TableIndex({ name: 'idx_notifications_created_at', columnNames: ['createdAt'] }),
    ]);

    await queryRunner.createForeignKeys('notifications', [
      new TableForeignKey({
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['eventId'],
        referencedTableName: 'security_events',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    ]);

    await queryRunner.createTable(
      new Table({
        name: 'email_logs',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'eventId', type: 'varchar', length: '36', isNullable: true },
          { name: 'recipient', type: 'varchar', length: '255' },
          { name: 'subject', type: 'varchar', length: '255' },
          { name: 'status', type: 'varchar', length: '32' },
          { name: 'errorMessage', type: 'text', isNullable: true },
          { name: 'retryCount', type: 'int', default: 0 },
          { name: 'createdAt', type: dt, default: 'CURRENT_TIMESTAMP' },
          { name: 'sentAt', type: dt, isNullable: true },
        ],
      }),
      true,
    );

    await queryRunner.createIndices('email_logs', [
      new TableIndex({ name: 'idx_email_logs_event_id', columnNames: ['eventId'] }),
      new TableIndex({ name: 'idx_email_logs_created_at', columnNames: ['createdAt'] }),
    ]);

    await queryRunner.createForeignKey(
      'email_logs',
      new TableForeignKey({
        columnNames: ['eventId'],
        referencedTableName: 'security_events',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'settings',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'userId', type: 'varchar', length: '36', isUnique: true },
          { name: 'recipientEmail', type: 'varchar', length: '255' },
          { name: 'emailEnabled', type: 'boolean', default: true },
          { name: 'wrongPasswordEnabled', type: 'boolean', default: true },
          { name: 'unknownFaceEnabled', type: 'boolean', default: true },
          { name: 'doorUnlockEnabled', type: 'boolean', default: false },
          { name: 'highTemperatureEnabled', type: 'boolean', default: true },
          { name: 'deviceOfflineEnabled', type: 'boolean', default: true },
          { name: 'temperatureThreshold', type: 'float', default: 35.0 },
          { name: 'emailCooldown', type: 'int', default: 60 },
          { name: 'timezone', type: 'varchar', length: '64', default: `'Asia/Kolkata'` },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'settings',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'commands',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'deviceId', type: 'varchar', length: '64' },
          { name: 'userId', type: 'varchar', length: '36' },
          { name: 'commandType', type: 'varchar', length: '16' },
          { name: 'status', type: 'varchar', length: '32', default: `'PENDING'` },
          { name: 'createdAt', type: dt, default: 'CURRENT_TIMESTAMP' },
          { name: 'expiresAt', type: dt },
          { name: 'acknowledgedAt', type: dt, isNullable: true },
          { name: 'failureReason', type: 'text', isNullable: true },
        ],
      }),
      true,
    );

    await queryRunner.createIndices('commands', [
      new TableIndex({ name: 'idx_commands_device_id', columnNames: ['deviceId'] }),
      new TableIndex({ name: 'idx_commands_status', columnNames: ['status'] }),
      new TableIndex({
        name: 'idx_commands_device_created',
        columnNames: ['deviceId', 'createdAt'],
      }),
    ]);

    await queryRunner.createForeignKey(
      'commands',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('commands', true);
    await queryRunner.dropTable('settings', true);
    await queryRunner.dropTable('email_logs', true);
    await queryRunner.dropTable('notifications', true);
    await queryRunner.dropTable('security_events', true);
    await queryRunner.dropTable('telemetry', true);
    await queryRunner.dropTable('device_states', true);
    await queryRunner.dropTable('devices', true);
    await queryRunner.dropTable('users', true);
  }
}
