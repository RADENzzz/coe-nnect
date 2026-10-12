import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan, Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { UserNotificationSetting } from './entities/user-notification-setting.entity';
import { SupabaseService } from '../../database/supabase.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { TRIGGERS, TRIGGER_MAP } from './triggers';

export interface NotificationListItem {
  notificationId: string;
  triggerKey: string;
  category: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  payload: Record<string, unknown> | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationSettingsItem {
  triggerKey: string;
  label: string;
  description: string;
  category: string;
  enabled: boolean;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private notificationRepo: Repository<Notification>,
    @InjectRepository(UserNotificationSetting)
    private settingRepo: Repository<UserNotificationSetting>,
    private readonly supabase: SupabaseService,
  ) {}

  // ════════════════════════════════════════════
  // Reads
  // ════════════════════════════════════════════

  async listForUser(
    userId: string,
    dto: ListNotificationsDto,
  ): Promise<{ items: NotificationListItem[]; hasMore: boolean }> {
    const qb = this.notificationRepo
      .createQueryBuilder('n')
      .where('n.recipient_id = :userId', { userId })
      .orderBy('n.created_at', 'DESC')
      .take(dto.limit + 1); // fetch one extra to know if there's a next page

    if (dto.before) {
      qb.andWhere('n.created_at < :before', { before: new Date(dto.before) });
    }
    if (dto.category) {
      qb.andWhere('n.category = :category', { category: dto.category });
    }
    if (dto.isRead !== undefined) {
      qb.andWhere('n.is_read = :isRead', { isRead: dto.isRead });
    }
    if (dto.search && dto.search.trim() !== '') {
      qb.andWhere(
        '(n.title ILIKE :q OR n.body ILIKE :q)',
        { q: `%${dto.search.trim()}%` },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > dto.limit;
    const items = (hasMore ? rows.slice(0, dto.limit) : rows).map((r) =>
      this.toListItem(r),
    );

    return { items, hasMore };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.notificationRepo.count({
      where: { recipientId: userId, isRead: false },
    });
  }

  private toListItem(r: Notification): NotificationListItem {
    return {
      notificationId: r.notificationId,
      triggerKey: r.triggerKey,
      category: r.category,
      title: r.title,
      body: r.body,
      entityType: r.entityType,
      entityId: r.entityId,
      payload: r.payload,
      isRead: r.isRead,
      readAt: r.readAt ? r.readAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  // ════════════════════════════════════════════
  // Mutations
  // ════════════════════════════════════════════

  async markAsRead(userId: string, notificationId: string): Promise<void> {
    const found = await this.notificationRepo.findOne({
      where: { notificationId },
    });
    if (!found) throw new NotFoundException('Notification not found');
    if (found.recipientId !== userId) {
      throw new ForbiddenException('Not your notification');
    }
    if (found.isRead) return; // idempotent

    found.isRead = true;
    found.readAt = new Date();
    await this.notificationRepo.save(found);
  }

  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true, readAt: new Date() })
      .where('recipient_id = :userId AND is_read = false', { userId })
      .execute();

    return { updated: result.affected ?? 0 };
  }

  async deleteOne(userId: string, notificationId: string): Promise<void> {
    const found = await this.notificationRepo.findOne({
      where: { notificationId },
    });
    if (!found) throw new NotFoundException('Notification not found');
    if (found.recipientId !== userId) {
      throw new ForbiddenException('Not your notification');
    }
    await this.notificationRepo.delete(notificationId);
  }

  async clearAllForUser(userId: string): Promise<{ deleted: number }> {
    const result = await this.notificationRepo.delete({
      recipientId: userId,
    });
    return { deleted: result.affected ?? 0 };
  }

  // ════════════════════════════════════════════
  // Settings (per-user, per-trigger)
  // ════════════════════════════════════════════

  async getSettings(userId: string): Promise<NotificationSettingsItem[]> {
    const overrides = await this.settingRepo.find({ where: { userId } });
    const overrideMap = new Map(
      overrides.map((o) => [o.triggerKey, o.enabled]),
    );

    return TRIGGERS.map((t) => ({
      triggerKey: t.key,
      label: t.label,
      description: t.description,
      category: t.category,
      enabled: overrideMap.has(t.key)
        ? overrideMap.get(t.key)!
        : t.defaultEnabled,
    }));
  }

  async updateSetting(
    userId: string,
    triggerKey: string,
    enabled: boolean,
  ): Promise<NotificationSettingsItem> {
    if (!TRIGGER_MAP.has(triggerKey)) {
      throw new NotFoundException(`Unknown trigger: ${triggerKey}`);
    }

    await this.settingRepo.upsert(
      { userId, triggerKey, enabled, updatedAt: new Date() },
      ['userId', 'triggerKey'],
    );

    const meta = TRIGGER_MAP.get(triggerKey)!;
    return {
      triggerKey,
      label: meta.label,
      description: meta.description,
      category: meta.category,
      enabled,
    };
  }

  // ════════════════════════════════════════════
  // Retention — runs nightly at 3 AM
  // ════════════════════════════════════════════

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runRetentionSweep(): Promise<void> {
    try {
      const days = await this.getRetentionDays();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const result = await this.notificationRepo.delete({
        createdAt: LessThan(cutoff),
      });

      const deleted = result.affected ?? 0;
      if (deleted > 0) {
        this.logger.log(
          `Retention sweep: deleted ${deleted} notification(s) older than ${days} days`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Retention sweep failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async getRetentionDays(): Promise<number> {
    const { data } = await this.supabase
      .getAdminClient()
      .from('scheduling_setting')
      .select('value')
      .eq('setting_key', 'notification_retention_days')
      .maybeSingle();

    const raw = data?.value;
    if (typeof raw === 'number' && raw > 0) return raw;
    if (typeof raw === 'string') {
      const n = Number(raw);
      if (!Number.isNaN(n) && n > 0) return n;
    }
    return 90;
  }
}