import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import { useNotificationSocket } from '../../hooks/use-notification-socket';
import { useMarkRead } from '../../hooks/use-notifications';
import type { NotificationItem } from '../../api/notifications.api';
import {
  notificationChips,
  notificationHref,
  notificationIcon,
  shellForPath,
} from '../../lib/notification-target';

const MAX_TOASTS = 3;
const TOAST_TTL_MS = 7000;

interface ToastItem {
  item: NotificationItem;
}

/**
 * Live in-app toast for socket-delivered notifications.
 *
 * Mounted once inside the shell (AppShell). Independent of the React Query
 * cache bridge: the bridge keeps the bell/inbox fresh, while this component
 * surfaces the arrival and offers a one-click deep link to the record.
 */
export default function NotificationToaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, number>());
  const { subscribe } = useNotificationSocket();
  const markRead = useMarkRead();
  const navigate = useNavigate();
  const location = useLocation();
  const shell = shellForPath(location.pathname);

  const dismiss = useCallback((notificationId: string) => {
    setToasts((prev) =>
      prev.filter((t) => t.item.notificationId !== notificationId),
    );
    const timer = timers.current.get(notificationId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(notificationId);
    }
  }, []);

  const pushToast = useCallback(
    (item: NotificationItem) => {
      if (!item?.notificationId) return;

      setToasts((prev) => {
        if (prev.some((t) => t.item.notificationId === item.notificationId)) {
          return prev;
        }
        return [...prev, { item }].slice(-MAX_TOASTS);
      });

      const existing = timers.current.get(item.notificationId);
      if (existing !== undefined) window.clearTimeout(existing);
      const timer = window.setTimeout(
        () => dismiss(item.notificationId),
        TOAST_TTL_MS,
      );
      timers.current.set(item.notificationId, timer);
    },
    [dismiss],
  );

  useEffect(
    () =>
      subscribe<NotificationItem>('notification:new', (item) => {
        pushToast(item);
      }),
    [subscribe, pushToast],
  );

  // Clear pending timers on unmount.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => window.clearTimeout(timer));
      map.clear();
    };
  }, []);

  const open = (item: NotificationItem) => {
    if (!item.isRead) markRead.mutate(item.notificationId);
    const href = notificationHref(item, shell);
    dismiss(item.notificationId);
    navigate(href ?? `${shell}/notifications`);
  };

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="New notifications"
      className="fixed z-[140] inset-x-4 bottom-20 md:inset-x-auto md:right-6 md:bottom-6 md:w-[380px] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map(({ item }) => {
        const chips = notificationChips(item).slice(0, 2);
        return (
          <div
            key={item.notificationId}
            className="pointer-events-auto relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl animate-fade-in"
          >
            <span
              aria-hidden
              className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#5c1219]"
            />
            <div className="flex gap-3 p-3 pl-4">
              <div className="shrink-0 w-8 h-8 flex items-center justify-center rounded bg-[#5c1219]/10 text-[#5c1219]">
                <Icon name={notificationIcon(item)} size={16} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  New notification
                </p>
                <p className="text-sm font-semibold text-slate-900 leading-tight mt-0.5">
                  {item.title}
                </p>
                {item.body && (
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                    {item.body}
                  </p>
                )}

                {chips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {chips.map((chip) => (
                      <span
                        key={`${chip.icon}-${chip.label}`}
                        title={chip.title}
                        className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                      >
                        <Icon name={chip.icon} size={10} />
                        <span className="max-w-[150px] truncate">
                          {chip.label}
                        </span>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => open(item)}
                    className="inline-flex items-center gap-1 rounded bg-[#5c1219] px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition"
                  >
                    Open
                    <Icon name="arrow_forward" size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => dismiss(item.notificationId)}
                    className="inline-flex items-center rounded px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 transition"
                  >
                    Dismiss
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => dismiss(item.notificationId)}
                className="shrink-0 self-start text-slate-400 hover:text-slate-600 transition"
                aria-label="Dismiss notification"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
