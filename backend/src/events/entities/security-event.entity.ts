import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { dateColumnType } from '../../database/column-types';

export type EventSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

@Entity('security_events')
@Index('idx_security_events_device_timestamp', ['deviceId', 'timestamp'])
export class SecurityEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128, unique: true, nullable: true })
  externalEventId: string | null;

  @Index('idx_security_events_device_id')
  @Column({ type: 'varchar', length: 64 })
  deviceId: string;

  @Index('idx_security_events_event_type')
  @Column({ type: 'varchar', length: 64 })
  eventType: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  authenticationMethod: string | null;

  @Index('idx_security_events_severity')
  @Column({ type: 'varchar', length: 16 })
  severity: EventSeverity;

  @Column({ type: 'text' })
  description: string;

  @Index('idx_security_events_timestamp')
  @Column({ type: dateColumnType() })
  timestamp: Date;
}
