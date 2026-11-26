import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { dateColumnType } from '../../database/column-types';

export type CommandType = 'UNLOCK' | 'LOCK';
export type CommandStatus =
  | 'PENDING'
  | 'ACKNOWLEDGED'
  | 'TIMEOUT'
  | 'FAILED'
  | 'REJECTED_OFFLINE';

@Entity('commands')
@Index('idx_commands_device_created', ['deviceId', 'createdAt'])
export class Command {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_commands_device_id')
  @Column({ type: 'varchar', length: 64 })
  deviceId: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'varchar', length: 16 })
  commandType: CommandType;

  @Index('idx_commands_status')
  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status: CommandStatus;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: dateColumnType() })
  expiresAt: Date;

  @Column({ type: dateColumnType(), nullable: true })
  acknowledgedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;
}
