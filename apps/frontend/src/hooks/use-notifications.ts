import { useEffect } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store';
import { useNotificationSocket } from './use-notification-socket';
import {
  clearAllNotifications,
  deleteNotification,
  fetchNotifications,
  fetchUnreadCount,
  ListNotificationsParams,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationItem,
} from '../api/notifications.api';

// ────────────────────────────────────────────
// Query keys
// ────────────────────────────────────────────

export const qk = {
  list: (params: ListNotificationsParams) =>
    ['notifications', 'list', params] as const,
  unread: () => ['notifications', 'unread'] as const,
  recent: () => ['notifications', 'recent'] as const,
};

// ────────────────────────────────────────────
// Queries
// ────────────────────────────────────────────

export function useUnreadCount() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: qk.unread(),
    queryFn: fetchUnreadCount,
    enabled: !!user,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useNotificationsList(params: ListNotificationsParams = {}) {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: qk.list(params),
    queryFn: () => fetchNotifications(params),
    enabled: !!user,
    staleTime: 15 * 1000,
  });
}

// ────────────────────────────────────────────
// Mutations
// ────────────────────────────────────────────

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: (_v, id) => {
      // Optimistic: flip isRead in every cached list, then refetch counts.
      qc.setQueriesData<{ items: NotificationItem[]; hasMore: boolean }>(
        { queryKey: ['notifications', 'list'] },
        (prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((n) =>
                  n.notificationId === id
                    ? { ...n, isRead: true, readAt: new Date().toISOString() }
                    : n,
                ),
              }
            : prev,
      );
      qc.invalidateQueries({ queryKey: qk.unread() });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      qc.setQueriesData<{ items: NotificationItem[]; hasMore: boolean }>(
        { queryKey: ['notifications', 'list'] },
        (prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((n) => ({
                  ...n,
                  isRead: true,
                  readAt: n.readAt ?? new Date().toISOString(),
                })),
              }
            : prev,
      );
      qc.setQueryData(qk.unread(), 0);
    },
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', 'list'] });
      qc.invalidateQueries({ queryKey: qk.unread() });
    },
  });
}

export function useClearAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clearAllNotifications,
    onSuccess: () => {
      qc.setQueriesData<{ items: NotificationItem[]; hasMore: boolean }>(
        { queryKey: ['notifications', 'list'] },
        (prev) => (prev ? { ...prev, items: [], hasMore: false } : prev),
      );
      qc.setQueryData(qk.unread(), 0);
    },
  });
}

// ────────────────────────────────────────────
// WS bridge — attaches once per app session
// ────────────────────────────────────────────

/**
 * Bridges socket.io events into React Query cache.
 * Mount exactly once per shell (we mount in AppShell).
 */
export function useNotificationSocketBridge() {
  const qc = useQueryClient();
  const { subscribe, isConnected } = useNotificationSocket();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) return;

    const offNew = subscribe<NotificationItem>(
      'notification:new',
      (n) => {
        // Prepend to every cached list, capped at 100.
        qc.setQueriesData<{ items: NotificationItem[]; hasMore: boolean }>(
          { queryKey: ['notifications', 'list'] },
          (prev) => {
            if (!prev) return prev;
            const already = prev.items.some(
              (x) => x.notificationId === n.notificationId,
            );
            if (already) return prev;
            return {
              ...prev,
              items: [n, ...prev.items].slice(0, 100),
            };
          },
        );
        // New arrival implies +1 unread.
        qc.setQueryData<number>(qk.unread(), (prev) => (prev ?? 0) + 1);
      },
    );

    const offCount = subscribe<{ count: number }>(
      'unread_count',
      (payload) => {
        qc.setQueryData(qk.unread(), payload.count);
      },
    );

    return () => {
      offNew();
      offCount();
    };
  }, [subscribe, qc, user]);

  return { isConnected };
}