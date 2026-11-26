import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { dateColumnType } from '../../database/column-types';

@Entity('device_states')
export class DeviceState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  deviceId: string;

  @Column({ type: 'float', nullable: true })
  temperature: number | null;

  @Column({ type: 'float', nullable: true })
  distance: number | null;

  @Column({ type: 'boolean', default: false })
  fanState: boolean;

  @Column({ type: 'boolean', default: false })
  ledState: boolean;

  @Column({ type: 'boolean', default: false })
  doorUnlocked: boolean;

  @Column({ type: 'boolean', default: false })
  buzzerState: boolean;

  @Column({ type: dateColumnType() })
  updatedAt: Date;
}
