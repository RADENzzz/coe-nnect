import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import NotificationItem from '../../components/notifications/NotificationItem';
import NotificationFilters, {
  type NotificationFiltersValue,
} from './components/NotificationFilters';
import {
  useClearAll,
  useDeleteNotification,
  useMarkAllRead,
  useMarkRead,
  useNotificationsList,
  useUnreadCount,
} from '../../hooks/use-notifications';
import type { NotificationItem as NotificationData } from '../../api/notifications.api';

const PAGE_SIZE = 20;

export default function NotificationsInboxPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Filters ──
  const [filters, setFilters] = useState<NotificationFiltersValue>({
    category: searchParams.get('category'),
    isRead: (() => {
      const v = searchParams.get('isRead');
      if (v === 'true') return true;
      if (v === 'false') return false;
      return null;
    })(),
    search: searchParams.get('q') ?? '',
  });

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => window.clearTimeout(t);
  }, [filters.search]);

  // Sync filters → URL (so the view is shareable/bookmarkable)
  useEffect(() => {
    const next = new URLSearchParams();
    if (filters.category) next.set('category', filters.category);
    if (filters.isRead !== null) next.set('isRead', String(filters.isRead));
    if (debouncedSearch) next.set('q', debouncedSearch);
    setSearchParams(next, { replace: true });
  }, [filters.category, filters.isRead, debouncedSearch, setSearchParams]);

  // ── Pagination state ──
  const [before, setBefore] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<NotificationData[]>([]);
  const [hasMore, setHasMore] = useState(false);

  // Reset pagination when filters change
  useEffect(() => {
    setBefore(undefined);
    setAccumulated([]);
    setHasMore(false);
  }, [filters.category, filters.isRead, debouncedSearch]);

  // ── Query ──
  const params = useMemo(
    () => ({
      limit: PAGE_SIZE,
      before,
      category: filters.category ?? undefined,
      isRead: filters.isRead === null ? undefined : filters.isRead,
      search: debouncedSearch || undefined,
    }),
    [before, filters.category, filters.isRead, debouncedSearch],
  );

  const { data, isLoading, isFetching } = useNotificationsList(params);

  // Merge fetched page into accumulated list
  useEffect(() => {
    if (!data) return;
    if (!before) {
      setAccumulated(data.items);
    } else {
      setAccumulated((prev) => {
        const seen = new Set(prev.map((n) => n.notificationId));
        const merged = [...prev];
        for (const item of data.items) {
          if (!seen.has(item.notificationId)) merged.push(item);
        }
        return merged;
      });
    }
    setHasMore(data.hasMore);
  }, [data, before]);

  const loadMore = () => {
    if (accumulated.length === 0) return;
    const last = accumulated[accumulated.length - 1];
    setBefore(last.createdAt);
  };

  // ── Mutations ──
  const { data: unread = 0 } = useUnreadCount();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const remove = useDeleteNotification();
  const clearAll = useClearAll();

  const [confirmClear, setConfirmClear] = useState(false);

  // ── Optimistic local updates for smooth UX ──
  const handleMarkRead = useCallback(
    (id: string) => {
      setAccumulated((prev) =>
        prev.map((n) =>
          n.notificationId === id
            ? { ...n, isRead: true, readAt: new Date().toISOString() }
            : n,
        ),
      );
      markRead.mutate(id);
    },
    [markRead],
  );

  const handleDelete = useCallback(
    (id: string) => {
      setAccumulated((prev) =>
        prev.filter((n) => n.notificationId !== id),
      );
      remove.mutate(id);
    },
    [remove],
  );

  const handleMarkAllRead = useCallback(() => {
    setAccumulated((prev) =>
      prev.map((n) => ({
        ...n,
        isRead: true,
        readAt: n.readAt ?? new Date().toISOString(),
      })),
    );
    markAllRead.mutate();
  }, [markAllRead]);

  const handleClearAll = useCallback(() => {
    setAccumulated([]);
    setHasMore(false);
    clearAll.mutate();
    setConfirmClear(false);
  }, [clearAll]);

  const isEmpty =
    !isLoading && !isFetching && accumulated.length === 0;

  const hasActiveFilters =
    filters.category !== null ||
    filters.isRead !== null ||
    debouncedSearch.trim() !== '';

  const clearFilters = () => {
    setFilters({ category: null, isRead: null, search: '' });
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
            <Icon name="notifications" size={28} />
            Notifications
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {unread > 0
              ? `${unread} unread notification${unread === 1 ? '' : 's'}`
              : 'All caught up'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unread > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={markAllRead.isPending}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-surface-variant rounded-lg hover:bg-surface-container-low transition disabled:opacity-50"
            >
              <Icon name="done_all" size={14} />
              Mark all read
            </button>
          )}
          {accumulated.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-rose-200 text-rose-700 rounded-lg hover:bg-rose-50 transition"
            >
              <Icon name="delete_sweep" size={14} />
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4">
        <NotificationFilters
          value={filters}
          onChange={setFilters}
          unreadCount={unread}
        />
      </div>

      {/* List */}
      {isLoading && accumulated.length === 0 && (
        <div className="py-16 text-center text-sm text-slate-500">
          Loading notifications…
        </div>
      )}

      {isEmpty && (
        <div className="py-16 text-center border border-dashed border-surface-variant rounded-xl">
          <Icon
            name={hasActiveFilters ? 'search_off' : 'notifications_off'}
            size={48}
            className="text-slate-300 mx-auto mb-3"
          />
          <p className="text-base font-semibold text-slate-700">
            {hasActiveFilters
              ? 'No notifications match your filters'
              : "You're all caught up"}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {hasActiveFilters
              ? 'Try clearing the filters to see more.'
              : 'New activity will appear here automatically.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 px-4 py-2 text-sm font-semibold text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {accumulated.length > 0 && (
        <div className="border border-surface-variant rounded-xl overflow-hidden divide-y divide-surface-variant bg-white">
          {accumulated.map((n) => (
            <NotificationItem
              key={n.notificationId}
              item={n}
              onMarkRead={handleMarkRead}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={isFetching}
            className="px-4 py-2 text-sm font-semibold text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition disabled:opacity-50 flex items-center gap-2"
          >
            {isFetching ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                Loading…
              </>
            ) : (
              <>
                <Icon name="expand_more" size={16} />
                Load older
              </>
            )}
          </button>
        </div>
      )}

      {/* Confirm clear-all */}
      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear all notifications?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              disabled={clearAll.isPending}
              className="px-4 py-2 text-sm font-semibold bg-rose-600 text-white hover:bg-rose-700 transition disabled:opacity-50"
            >
              {clearAll.isPending ? 'Clearing…' : 'Clear all'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-rose-50 border border-rose-200">
            <Icon
              name="warning"
              size={18}
              className="text-rose-700 shrink-0 mt-0.5"
            />
            <div className="text-sm text-rose-900">
              <p className="font-semibold">
                This will permanently delete all your notifications.
              </p>
            </div>
          </div>
          <p className="text-sm text-slate-600">
            This action cannot be undone. New notifications will still
            arrive for future activity.
          </p>
        </div>
      </Modal>
    </div>
  );
}