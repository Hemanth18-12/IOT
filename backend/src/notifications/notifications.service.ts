import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { EventSeverity } from '../events/entities/security-event.entity';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { UsersService } from '../users/users.service';
import { Notification } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    private readonly usersService: UsersService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async createForAllUsers(input: {
    eventId?: string | null;
    eventType: string;
    title: string;
    message: string;
    severity: EventSeverity;
  }): Promise<Notification[]> {
    const users = await this.usersService.findAll();
    const created: Notification[] = [];

    for (const user of users) {
      const entity = this.notifRepo.create({
        userId: user.id,
        eventId: input.eventId || null,
        eventType: input.eventType,
        title: input.title,
        message: input.message,
        severity: input.severity,
        isRead: false,
      });
      const saved = await this.notifRepo.save(entity);
      created.push(saved);

      const unreadCount = await this.getUnreadCount(user.id);
      this.realtimeGateway.emitNotificationNew(user.id, {
        notification: saved,
        unreadCount,
      });
    }

    return created;
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notifRepo.count({ where: { userId, isRead: false } });
  }

  async findForUser(
    userId: string,
    query: {
      severity?: string;
      eventType?: string;
      unreadOnly?: boolean;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Math.max(query.page || 1, 1);
    const limit = Math.min(Math.max(query.limit || 25, 1), 100);

    const where: FindOptionsWhere<Notification> = { userId };
    if (query.severity) where.severity = query.severity as EventSeverity;
    if (query.eventType) where.eventType = query.eventType;
    if (query.unreadOnly) where.isRead = false;

    const [items, total] = await this.notifRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const unreadCount = await this.getUnreadCount(userId);

    return {
      items,
      total,
      unreadCount,
      page,
      limit,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    };
  }

  async markAsRead(userId: string, id: string) {
    const notif = await this.notifRepo.findOne({ where: { id, userId } });
    if (!notif) {
      throw new NotFoundException('Notification not found');
    }
    notif.isRead = true;
    const saved = await this.notifRepo.save(notif);
    const unreadCount = await this.getUnreadCount(userId);
    return { notification: saved, unreadCount };
  }

  async markAllAsRead(userId: string) {
    const result = await this.notifRepo.update({ userId, isRead: false }, { isRead: true });
    return {
      updatedCount: result.affected || 0,
      unreadCount: 0,
    };
  }
}
