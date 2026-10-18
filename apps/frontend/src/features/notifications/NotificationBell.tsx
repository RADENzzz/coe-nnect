import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import NotificationItem from './NotificationItem';
import {
  useDeleteNotification,
  useMarkAllRead,
  useMarkRead,
  useNotificationsList,
  useUnreadCount,
} from '../../hooks/use-notifications';

function useShellBase(): string {
  const location = useLocation();
  if (location.pathname.startsWith('/admin')) return '/admin';
  if (location.pathname.startsWith('/dean')) return '/dean';
  return '';
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const basePath = useShellBase();

  const { data: unread = 0 } = useUnreadCount();
  const { data: list, isLoading } = useNotificationsList({ limit: 10 });
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const remove = useDeleteNotification();

  // Close on outside click + Escape. Desktop only — mobile uses backdrop.
  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent | TouchEvent) => {
      // Skip if mobile — handled by backdrop tap
      if (window.matchMedia('(min-width: 768px)').matches) {
        if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
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

  // Lock body scroll when mobile sheet is open
  useEffect(() => {
    if (!open) return;
    const isMobile = !window.matchMedia('(min-width: 768px)').matches;
    if (!isMobile) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
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

  // ── Shared content ──
  const headerBlock = (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
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
            className="text-[11px] font-semibold text-slate-500 hover:text-[#5c1219] disabled:opacity-50 px-2 py-1"
          >
            Mark all read
          </button>
        )}
        <button
          type="button"
          onClick={openSettings}
          className="p-1.5 hover:bg-slate-100 rounded transition-colors text-slate-500"
          title="Notification settings"
          aria-label="Notification settings"
        >
          <Icon name="settings" size={16} />
        </button>
      </div>
    </div>
  );

  const bodyBlock = (
    <div className="flex-1 overflow-y-auto overscroll-contain">
      {isLoading && (
        <div className="px-4 py-12 text-center text-sm text-slate-500">
          <div className="w-6 h-6 border-2 border-slate-300 border-t-[#5c1219] animate-spin mx-auto mb-3 rounded-full" />
          Loading…
        </div>
      )}
      {!isLoading && items.length === 0 && (
        <div className="px-4 py-16 text-center">
          <Icon
            name="notifications_off"
            size={40}
            className="text-slate-300 mx-auto mb-3"
          />
          <p className="text-sm font-semibold text-slate-700">
            You're all caught up
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-[240px] mx-auto">
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
  );

  const footerBlock = (
    <button
      type="button"
      onClick={openInbox}
      className="w-full px-4 py-3.5 text-sm font-semibold text-[#5c1219] hover:bg-[#5c1219]/5 transition-colors border-t border-slate-100 flex items-center justify-center gap-1.5 shrink-0 pb-safe"
    >
      View all
      <Icon name="arrow_forward" size={14} />
    </button>
  );

  return (
    <>
      {/* Bell button */}
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="tap-target hover:bg-slate-50 transition-colors flex items-center justify-center text-slate-500 relative rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]/30"
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

        {/* ── Desktop: dropdown ── */}
        {open && (
        <div
          role="dialog"
          aria-label="Recent notifications"
          className="
            fixed md:absolute
            left-4 right-4 md:left-auto md:right-0
            top-[calc(48px+8px)] md:top-auto md:mt-2
            w-auto md:w-[360px] max-w-none md:max-w-[calc(100vw-1.5rem)]
            max-h-[calc(100vh-80px)]
            bg-white border border-slate-200 shadow-xl rounded-lg z-50
            overflow-hidden flex flex-col
            animate-fade-in
          "
        >
            {headerBlock}
            {bodyBlock}
            {footerBlock}
          </div>
        )}
      </div>

      {/* ── Mobile: full-screen sheet ── */}
      {open && (
        <div className="md:hidden fixed inset-0 z-[150] flex flex-col bg-white animate-slide-up pt-safe">
          {/* Mobile header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-slate-900">
                Notifications
              </span>
              {hasUnread && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#5c1219] bg-[#5c1219]/10 px-1.5 py-0.5 rounded">
                  {unread} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hasUnread && (
                <button
                  type="button"
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="text-xs font-semibold text-slate-600 hover:text-[#5c1219] disabled:opacity-50 px-2 py-1"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={openSettings}
                className="w-9 h-9 flex items-center justify-center hover:bg-slate-100 rounded transition-colors text-slate-500"
                aria-label="Notification settings"
              >
                <Icon name="settings" size={18} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-9 h-9 flex items-center justify-center hover:bg-slate-100 rounded transition-colors text-slate-500 -mr-1"
                aria-label="Close"
              >
                <Icon name="close" size={20} />
              </button>
            </div>
          </div>

          {/* Mobile body */}
          <div className="flex-1 overflow-y-auto overscroll-contain bg-slate-50/30">
            {isLoading && (
              <div className="px-4 py-16 text-center text-sm text-slate-500">
                <div className="w-6 h-6 border-2 border-slate-300 border-t-[#5c1219] animate-spin mx-auto mb-3 rounded-full" />
                Loading…
              </div>
            )}
            {!isLoading && items.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
                <div className="w-16 h-16 bg-white border border-slate-200 flex items-center justify-center rounded-full mb-4">
                  <Icon
                    name="notifications_off"
                    size={32}
                    className="text-slate-300"
                  />
                </div>
                <p className="text-base font-semibold text-slate-800">
                  You're all caught up
                </p>
                <p className="text-sm text-slate-500 mt-1 max-w-[280px]">
                  New activity will appear here.
                </p>
              </div>
            )}
            {!isLoading && items.length > 0 && (
              <div className="divide-y divide-slate-100 bg-white">
                {items.map((n) => (
                  <NotificationItem
                    key={n.notificationId}
                    item={n}
                    onMarkRead={(id) => markRead.mutate(id)}
                    onDelete={(id) => remove.mutate(id)}
                    onClose={() => setOpen(false)}
                    compact={false}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Mobile footer */}
          <div className="border-t border-slate-200 bg-white shrink-0 pb-safe">
            <button
              type="button"
              onClick={openInbox}
              className="w-full px-4 py-4 text-sm font-semibold text-[#5c1219] hover:bg-[#5c1219]/5 transition-colors flex items-center justify-center gap-1.5"
            >
              View all notifications
              <Icon name="arrow_forward" size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}