import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, type Repository } from 'typeorm';
import { Notification } from '../common/entities/notification.entity';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  async list(tenantId: string, userId: string) {
    return this.notificationRepository.find({
      where: [
        { tenantId, userId, expiresAt: IsNull() },
        { tenantId, userId, expiresAt: MoreThan(new Date()) },
      ],
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async markRead(tenantId: string, userId: string, notificationId: string) {
    const notification = await this.findOne(tenantId, userId, notificationId);
    notification.isRead = true;
    return this.notificationRepository.save(notification);
  }

  async markAllRead(tenantId: string, userId: string) {
    await this.notificationRepository.update(
      { tenantId, userId, isRead: false },
      { isRead: true },
    );
    return { message: 'Notifications marked as read' };
  }

  async remove(tenantId: string, userId: string, notificationId: string) {
    const notification = await this.findOne(tenantId, userId, notificationId);
    await this.notificationRepository.remove(notification);
    return { message: 'Notification deleted' };
  }

  async createMany(
    notifications: Array<{
      tenantId: string;
      userId: string;
      type: 'info' | 'warning' | 'error' | 'success';
      title: string;
      message: string;
      actionUrl?: string | null;
      expiresAt?: Date | null;
    }>,
  ) {
    if (notifications.length === 0) return [];
    const rows = notifications.map((notification) => ({
      tenantId: notification.tenantId,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      actionUrl: notification.actionUrl || null,
      expiresAt: notification.expiresAt || null,
    }));
    return this.notificationRepository.save(
      rows.map((notification) =>
        this.notificationRepository.create({
          ...notification,
        } as Partial<Notification>),
      ),
    );
  }

  private async findOne(
    tenantId: string,
    userId: string,
    notificationId: string,
  ) {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, tenantId, userId },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }
}
