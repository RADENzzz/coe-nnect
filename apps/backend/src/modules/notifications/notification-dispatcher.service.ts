import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { UserNotificationSetting } from './entities/user-notification-setting.entity';
import { NotificationsGateway } from './notifications.gateway';
import { TRIGGER_MAP } from './triggers';

export interface DispatchInput {
  /** Who should receive this notification. Duplicates are removed. */
  recipientUserIds: string[];

  /** Title shown in the bell + inbox. */
  title: string;

  /** Optional body text. */
  body?: string;

  /** Optional deep-link target. */
  entityType?: string;
  entityId?: string;

  /** Free-form context for the UI to render (subject code, reason, etc.). */
  payload?: Record<string, unknown>;
}

/**
 * Public entry point for other modules to fire notifications.
 *
 * Usage (from another service):
 *   await this.notificationDispatcher.dispatch('schedule.flagged', {
 *     recipientUserIds: [dhUserId, deanUserId],
 *     title: 'Schedule entry flagged',
 *     body: 'CPE 111 (CpE-1A) was flagged by …',
 *     entityType: 'schedule',
 *     entityId: scheduleId,
 *     payload: { subjectCode, sectionCode, reason },
 *   });
 *
 * Responsibilities:
 *   1. Look up the trigger metadata (category, label)
 *   2. Filter recipients against per-user opt-out settings
 *   3. Insert one row per surviving recipient
 *   4. Push a WebSocket event to each
 *   5. Push the updated unread count
 *
 * Fire-and-forget: failures are logged, never thrown.
 */
@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(
    @InjectRepository(Notification)
    private notificationRepo: Repository<Notification>,
    @InjectRepository(UserNotificationSetting)
    private settingRepo: Repository<UserNotificationSetting>,
    private readonly gateway: NotificationsGateway,
  ) {}

  async dispatch(triggerKey: string, input: DispatchInput): Promise<void> {
    try {
      const meta = TRIGGER_MAP.get(triggerKey);
      if (!meta) {
        this.logger.warn(
          `Dispatch: unknown trigger '${triggerKey}' — dropping. ` +
            `Add it to TRIGGERS in triggers.ts if intentional.`,
        );
        return;
      }

      const recipientIds = Array.from(
        new Set(input.recipientUserIds.filter((id) => !!id)),
      );
      if (recipientIds.length === 0) {
        this.logger.debug(
          `Dispatch '${triggerKey}': no recipients — skipping`,
        );
        return;
      }

      // ── Filter against per-user opt-out settings ──
      const overrides = await this.settingRepo.find({
        where: {
          userId: In(recipientIds),
          triggerKey,
        },
      });

      const disabled = new Set(
        overrides.filter((s) => !s.enabled).map((s) => s.userId),
      );

      const enabledRecipients = recipientIds.filter(
        (id) => !disabled.has(id),
      );

      if (enabledRecipients.length === 0) {
        this.logger.debug(
          `Dispatch '${triggerKey}': all recipients opted out — skipping`,
        );
        return;
      }

      // ── Insert one row per recipient ──
      const rows = enabledRecipients.map((recipientId) =>
        this.notificationRepo.create({
          recipientId,
          triggerKey,
          category: meta.category,
          title: input.title,
          body: input.body ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          payload: input.payload ?? null,
        }),
      );

      const saved = await this.notificationRepo.save(rows);

      this.logger.log(
        `Dispatch '${triggerKey}' → ${saved.length} recipient(s)`,
      );

      // ── Push over WebSocket ──
      for (const n of saved) {
        const delivered = this.gateway.pushToUser(n.recipientId, 'notification:new', {
          notificationId: n.notificationId,
          triggerKey: n.triggerKey,
          category: n.category,
          title: n.title,
          body: n.body,
          entityType: n.entityType,
          entityId: n.entityId,
          payload: n.payload,
          createdAt: n.createdAt,
        });

        if (!delivered) {
          this.logger.debug(
            `Push to user=${n.recipientId}: no live socket (polling will catch it)`,
          );
        }
      }

      // ── Push updated unread counts ──
      for (const recipientId of enabledRecipients) {
        const count = await this.notificationRepo.count({
          where: { recipientId, isRead: false },
        });
        this.gateway.pushUnreadCount(recipientId, count);
      }
    } catch (err) {
      // Fire-and-forget — never let a notification failure break the
      // business operation that triggered it.
      this.logger.error(
        `Dispatch '${triggerKey}' failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}