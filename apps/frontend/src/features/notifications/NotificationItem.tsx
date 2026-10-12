import { useLocation, useNavigate } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import type { NotificationItem as NotificationData } from '../../api/notifications.api';

interface NotificationItemProps {
  item: NotificationData;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
  onClose?: () => void;
  compact?: boolean;
}

// ── Icon per category ──
function iconForCategory(category: string): string {
  switch (category) {
    case 'schedule':
      return 'event';
    case 'approvals':
      return 'task_alt';
    case 'scheduling':
      return 'auto_awesome';
    case 'academic':
      return 'school';
    case 'faculty':
      return 'person';
    case 'facility':
      return 'meeting_room';
    case 'admin':
      return 'admin_panel_settings';
    default:
      return 'notifications';
  }
}

/**
 * Return a path (relative to the shell root) for the given notification.
 * The caller prepends the shell base ('', '/admin', '/dean').
 */
function pathFor(item: NotificationData): string | null {
  switch (item.entityType) {
    case 'schedule':
      return `/timetable?focus=${item.entityId}`;
    case 'faculty_request':
      return `/approvals`;
    case 'faculty':
      return `/faculty`;
    case 'term':
      return `/timetable`;
    case 'prospectus_pdf':
      return `/import/${item.entityId}`;
    case 'user':
      // Admin-only route
      return `/users`;
    default:
      return null;
  }
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

  // ── Role-aware base path ──
  const basePath = location.pathname.startsWith('/admin')
    ? '/admin'
    : location.pathname.startsWith('/dean')
    ? '/dean'
    : '';

  // ── Compute role-aware link ──
  const rawPath = pathFor(item);
  const href =
    rawPath && basePath && !rawPath.startsWith('/admin') && !rawPath.startsWith('/dean')
      ? `${basePath}${rawPath}`
      : rawPath;

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
      } transition-colors hover:bg-slate-50 ${
        item.isRead ? '' : 'bg-[#5c1219]/[0.03]'
      }`}
    >
      {/* Left accent bar for unread */}
      {!item.isRead && (
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#5c1219]"
        />
      )}

      {/* Icon */}
      <div
        className={`shrink-0 w-8 h-8 flex items-center justify-center rounded ${
          item.isRead
            ? 'bg-slate-100 text-slate-500'
            : 'bg-[#5c1219]/10 text-[#5c1219]'
        }`}
      >
        <Icon name={iconForCategory(item.category)} size={16} />
      </div>

      {/* Body */}
      <button
        type="button"
        onClick={handleOpen}
        className="flex-1 min-w-0 text-left"
      >
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
        <p className="text-[11px] text-slate-400 mt-1">
          {relativeTime(item.createdAt)}
        </p>
      </button>

      {/* Actions */}
      <div className="shrink-0 flex flex-col items-end justify-between gap-2">
        {!item.isRead && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead(item.notificationId);
            }}
            className="text-[11px] font-semibold text-[#5c1219] hover:underline"
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
          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 transition-opacity"
          title="Delete"
          aria-label="Delete notification"
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  );
}