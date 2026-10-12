import { api } from './client';

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface NotificationItem {
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

export interface ListNotificationsParams {
  limit?: number;
  before?: string;
  category?: string;
  isRead?: boolean;
  search?: string;
}

export interface ListNotificationsResponse {
  items: NotificationItem[];
  hasMore: boolean;
}

// ────────────────────────────────────────────
// REST
// ────────────────────────────────────────────

export async function fetchNotifications(
  params: ListNotificationsParams = {},
): Promise<ListNotificationsResponse> {
  const { data } = await api.get('/v1/notifications', { params });
  return data.data;
}

export async function fetchUnreadCount(): Promise<number> {
  const { data } = await api.get('/v1/notifications/unread-count');
  return data.data.count;
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.patch(`/v1/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<{ updated: number }> {
  const { data } = await api.post('/v1/notifications/read-all');
  return data.data;
}

export async function deleteNotification(id: string): Promise<void> {
  await api.delete(`/v1/notifications/${id}`);
}

export async function clearAllNotifications(): Promise<{ deleted: number }> {
  const { data } = await api.delete('/v1/notifications/clear-all');
  return data.data;
}

export async function fetchNotificationSettings(): Promise<
  NotificationSettingsItem[]
> {
  const { data } = await api.get('/v1/notifications/settings');
  return data.data;
}

export async function updateNotificationSetting(
  triggerKey: string,
  enabled: boolean,
): Promise<NotificationSettingsItem> {
  const { data } = await api.patch('/v1/notifications/settings', {
    triggerKey,
    enabled,
  });
  return data.data;
}