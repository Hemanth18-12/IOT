import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { dateColumnType } from '../../database/column-types';

@Entity('telemetry')
@Index('idx_telemetry_device_timestamp', ['deviceId', 'timestamp'])
export class Telemetry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_telemetry_device_id')
  @Column({ type: 'varchar', length: 64 })
  deviceId: string;

  @Column({ type: 'float' })
  temperature: number;

  @Column({ type: 'float' })
  distance: number;

  @Column({ type: 'boolean', default: false })
  fanState: boolean;

  @Column({ type: 'boolean', default: false })
  ledState: boolean;

  @Column({ type: 'boolean', default: false })
  doorUnlocked: boolean;

  @Column({ type: 'boolean', default: false })
  buzzerState: boolean;

  @Index('idx_telemetry_timestamp')
  @Column({ type: dateColumnType() })
  timestamp: Date;
}
