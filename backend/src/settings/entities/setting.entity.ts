import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('settings')
export class Setting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36, unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'varchar', length: 255 })
  recipientEmail: string;

  @Column({ type: 'boolean', default: true })
  emailEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  wrongPasswordEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  unknownFaceEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  doorUnlockEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  highTemperatureEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  deviceOfflineEnabled: boolean;

  @Column({ type: 'float', default: 35.0 })
  temperatureThreshold: number;

  @Column({ type: 'int', default: 60 })
  emailCooldown: number;

  @Column({ type: 'varchar', length: 64, default: 'Asia/Kolkata' })
  timezone: string;
}
