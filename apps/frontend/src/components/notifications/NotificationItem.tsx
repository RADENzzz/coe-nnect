import { useLocation, useNavigate } from 'react-router-dom';
import Icon from '../ui/Icon';
import type { NotificationItem as NotificationData } from '../../api/notifications.api';
import {
  notificationChips,
  notificationHref,
  notificationIcon,
  shellForPath,
} from '../../lib/notification-target';

interface NotificationItemProps {
  item: NotificationData;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
  onClose?: () => void;
  compact?: boolean;
}

// ── Relative time ──
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - t);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export default function NotificationItem({
  item,
  onMarkRead,
  onDelete,
  onClose,
  compact = false,
}: NotificationItemProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const shell = shellForPath(location.pathname);
  const href = notificationHref(item, shell);
  const chips = notificationChips(item);
  const visibleChips = compact ? chips.slice(0, 3) : chips;

  const handleOpen = () => {
    if (!item.isRead) onMarkRead(item.notificationId);
    if (href) {
      navigate(href);
      onClose?.();
    }
  };

  return (
    <div
      className={`group relative flex gap-3 px-4 ${
        compact ? 'py-3' : 'py-4'
      } transition-colors ${
        href
          ? 'cursor-pointer hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40'
          : ''
      } ${item.isRead ? '' : 'bg-primary/[0.03]'}`}
      role={href ? 'button' : undefined}
      tabIndex={href ? 0 : undefined}
      aria-label={href ? `Open notification: ${item.title}` : undefined}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (!href) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleOpen();
        }
      }}
    >
      {/* Left accent bar for unread */}
      {!item.isRead && (
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary"
        />
      )}

      {/* Icon */}
      <div
        className={`shrink-0 w-8 h-8 flex items-center justify-center rounded ${
          item.isRead
            ? 'bg-slate-100 text-slate-500'
            : 'bg-primary/10 text-primary'
        }`}
      >
        <Icon name={notificationIcon(item)} size={16} />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm leading-tight ${
            item.isRead
              ? 'font-medium text-slate-700'
              : 'font-semibold text-slate-900'
          }`}
        >
          {item.title}
        </p>
        {item.body && (
          <p
            className={`text-xs mt-0.5 ${
              compact ? 'line-clamp-2' : ''
            } text-slate-500`}
          >
            {item.body}
          </p>
        )}

        {visibleChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {visibleChips.map((chip) => (
              <span
                key={`${chip.icon}-${chip.label}`}
                title={chip.title}
                className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-600"
              >
                <Icon name={chip.icon} size={11} />
                <span className="max-w-[180px] truncate">{chip.label}</span>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px] text-slate-400">
            {relativeTime(item.createdAt)}
          </span>
          {href && (
            <span className="text-[11px] font-semibold text-primary inline-flex items-center gap-0.5">
              Open
              <Icon name="chevron_right" size={12} />
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="shrink-0 flex flex-col items-end justify-between gap-2">
        {!item.isRead && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead(item.notificationId);
            }}
            className="text-[11px] font-semibold text-primary hover:underline"
            title="Mark as read"
          >
            Mark read
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item.notificationId);
          }}
          className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-slate-400 hover:text-rose-600 transition-opacity"
          title="Delete"
          aria-label="Delete notification"
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  );
}
