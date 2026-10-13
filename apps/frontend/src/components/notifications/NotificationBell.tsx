import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Icon from '../ui/Icon';
import NotificationItem from './NotificationItem';
import {
  useDeleteNotification,
  useMarkAllRead,
  useMarkRead,
  useNotificationsList,
  useUnreadCount,
} from '../../hooks/use-notifications';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location.pathname.startsWith('/dean') ? '/dean' : '';

  const { data: unread = 0 } = useUnreadCount();
  const { data: list, isLoading } = useNotificationsList({ limit: 10 });
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const remove = useDeleteNotification();

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const badgeLabel = unread > 9 ? '9+' : String(unread);
  const hasUnread = unread > 0;
  const items = list?.items ?? [];

  const openInbox = () => {
    setOpen(false);
    navigate(`${basePath}/notifications`);
  };

  const openSettings = () => {
    setOpen(false);
    navigate(`${basePath}/settings?tab=notifications`);
  };

  return (
    <div ref={rootRef} className="relative">
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="tap-target hover:bg-slate-50 transition-colors flex items-center justify-center text-slate-500 relative"
        aria-label={
          hasUnread ? `Notifications (${unread} unread)` : 'Notifications'
        }
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Icon name="notifications" filled={hasUnread} />
        {hasUnread && (
          <span
            aria-hidden
            className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full bg-[#5c1219] text-white text-[10px] font-bold leading-none border border-white"
          >
            {badgeLabel}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="dialog"
          aria-label="Recent notifications"
          className="absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-1.5rem)] bg-white border border-slate-200 shadow-lg rounded-md z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">
                Notifications
              </span>
              {hasUnread && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#5c1219] bg-[#5c1219]/10 px-1.5 py-0.5 rounded">
                  {unread} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {hasUnread && (
                <button
                  type="button"
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="text-[11px] font-semibold text-slate-500 hover:text-[#5c1219] disabled:opacity-50"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={openSettings}
                className="p-1 hover:bg-slate-100 rounded transition-colors text-slate-500"
                title="Notification settings"
                aria-label="Notification settings"
              >
                <Icon name="settings" size={14} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[400px] overflow-y-auto">
            {isLoading && (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                Loading…
              </div>
            )}
            {!isLoading && items.length === 0 && (
              <div className="px-4 py-10 text-center">
                <Icon
                  name="notifications_off"
                  size={32}
                  className="text-slate-300 mx-auto mb-2"
                />
                <p className="text-sm font-semibold text-slate-700">
                  You're all caught up
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  New activity will appear here.
                </p>
              </div>
            )}
            {!isLoading &&
              items.map((n) => (
                <NotificationItem
                  key={n.notificationId}
                  item={n}
                  onMarkRead={(id) => markRead.mutate(id)}
                  onDelete={(id) => remove.mutate(id)}
                  onClose={() => setOpen(false)}
                  compact
                />
              ))}
          </div>

          {/* Footer */}
          <button
            type="button"
            onClick={openInbox}
            className="w-full px-4 py-3 text-sm font-semibold text-[#5c1219] hover:bg-[#5c1219]/5 transition-colors border-t border-slate-100 flex items-center justify-center gap-1.5"
          >
            View all
            <Icon name="arrow_forward" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}