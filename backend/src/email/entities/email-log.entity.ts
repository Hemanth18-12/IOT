import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SecurityEvent } from '../../events/entities/security-event.entity';
import { dateColumnType } from '../../database/column-types';

export type EmailLogStatus =
  | 'PENDING'
  | 'SENT'
  | 'FAILED'
  | 'SKIPPED_COOLDOWN'
  | 'SKIPPED_DISABLED';

@Entity('email_logs')
export class EmailLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_email_logs_event_id')
  @Column({ type: 'varchar', length: 36, nullable: true })
  eventId: string | null;

  @ManyToOne(() => SecurityEvent, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'eventId' })
  event?: SecurityEvent | null;

  @Column({ type: 'varchar', length: 255 })
  recipient: string;

  @Column({ type: 'varchar', length: 255 })
  subject: string;

  @Column({ type: 'varchar', length: 32 })
  status: EmailLogStatus;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Index('idx_email_logs_created_at')
  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: dateColumnType(), nullable: true })
  sentAt: Date | null;
}
