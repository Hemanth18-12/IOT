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
import { EventSeverity, SecurityEvent } from '../../events/entities/security-event.entity';

@Entity('notifications')
@Index('idx_notifications_user_read', ['userId', 'isRead'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_notifications_user_id')
  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'varchar', length: 36, nullable: true })
  eventId: string | null;

  @ManyToOne(() => SecurityEvent, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'eventId' })
  event?: SecurityEvent | null;

  @Column({ type: 'varchar', length: 64, default: 'SYSTEM' })
  eventType: string;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', length: 16 })
  severity: EventSeverity;

  @Column({ type: 'boolean', default: false })
  isRead: boolean;

  @Index('idx_notifications_created_at')
  @CreateDateColumn()
  createdAt: Date;
}
