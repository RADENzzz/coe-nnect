import type { ChatPresence } from './types';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Chat-style presence label.
 *
 * Online users read "Active now". Once they disconnect, the durable
 * heartbeat takes over and the label ages ("Active 5m ago", "Active 2h ago").
 * Keeping the wording in one helper means the conversation list, thread
 * header, and new-message picker never disagree.
 */
export function formatChatPresence(
  online: boolean,
  lastSeenAt: string | number | null | undefined,
  now = Date.now(),
): ChatPresence {
  if (online) return { online: true, label: 'Active now' };

  if (lastSeenAt == null) return { online: false, label: 'Offline' };

  const seen =
    typeof lastSeenAt === 'number'
      ? lastSeenAt
      : new Date(lastSeenAt).getTime();

  if (!Number.isFinite(seen)) return { online: false, label: 'Offline' };

  const diff = Math.max(0, now - seen);

  if (diff < MINUTE) return { online: false, label: 'Active just now' };

  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);
    return { online: false, label: `Active ${minutes}m ago` };
  }

  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return { online: false, label: `Active ${hours}h ago` };
  }

  if (diff < WEEK) {
    const days = Math.floor(diff / DAY);
    return { online: false, label: `Active ${days}d ago` };
  }

  const seenDate = new Date(seen);
  const label = seenDate.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year:
      seenDate.getFullYear() === new Date(now).getFullYear()
        ? undefined
        : 'numeric',
  });
  return { online: false, label: `Active ${label}` };
}
