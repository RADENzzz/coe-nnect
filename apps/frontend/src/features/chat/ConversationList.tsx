import { useMemo } from 'react';
import Icon from '../../components/ui/Icon';
import type {
  ConversationSummary,
  PresenceResolver,
} from './types';

const ROLE_LABELS: Record<string, string> = {
  administrator: 'Admin',
  college_dean: 'Dean',
  department_head: 'DH',
  college_secretary: 'Secretary',
  viewer: 'Viewer',
};

function initials(username: string): string {
  if (!username) return '—';
  return username.slice(0, 2).toUpperCase();
}

function conversationTimestamp(
  iso: string | null | undefined,
  now: number,
): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const today = new Date(now);
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('en-PH', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  if (now - date.getTime() < 7 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString('en-PH', { weekday: 'short' });
  }

  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

interface Props {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onPick: (conversationId: string) => void;
  presenceFor: PresenceResolver;
  isLoading?: boolean;
  now: number;
  query?: string;
  onStartNew?: () => void;
}

export default function ConversationList({
  conversations,
  activeConversationId,
  onPick,
  presenceFor,
  isLoading,
  now,
  query = '',
  onStartNew,
}: Props) {
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...conversations].sort((a, b) => {
      const ta = a.lastMessage?.createdAt
        ? new Date(a.lastMessage.createdAt).getTime()
        : 0;
      const tb = b.lastMessage?.createdAt
        ? new Date(b.lastMessage.createdAt).getTime()
        : 0;
      return tb - ta;
    });

    if (!q) return sorted;

    return sorted.filter((conversation) => {
      const name = conversation.otherUser?.username.toLowerCase() ?? '';
      const body = conversation.lastMessage?.body.toLowerCase() ?? '';
      return name.includes(q) || body.includes(q);
    });
  }, [conversations, query]);

  if (isLoading && conversations.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
        <p className="mt-3 text-[11px] text-on-surface-variant">
          Loading conversations…
        </p>
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-12 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant">
          <Icon name={query ? 'search_off' : 'forum'} size={22} />
        </div>
        <p className="text-sm font-semibold text-on-surface">
          {query
            ? `No chats match “${query}”`
            : conversations.length > 0
              ? 'No conversations to show'
              : 'No conversations yet'}
        </p>
        <p className="mt-1 max-w-[220px] text-[11px] leading-snug text-on-surface-variant">
          {query
            ? 'Try a different name or message.'
            : 'Start a conversation with a dean or department head.'}
        </p>
        {!query && onStartNew && (
          <button
            type="button"
            onClick={onStartNew}
            className="mt-4 inline-flex items-center gap-1.5 bg-primary px-3 py-2 text-[11px] font-semibold text-on-primary transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <Icon name="edit" size={13} />
            New message
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="divide-y divide-outline-variant/60">
      {visible.map((conversation) => {
        const other = conversation.otherUser;
        if (!other) return null;

        const active = conversation.conversationId === activeConversationId;
        const unread = conversation.unreadCount > 0;
        const presence = presenceFor(other.userId, other.lastSeenAt);
        const lastAt = conversation.lastMessage?.createdAt ?? null;
        const stamp = conversationTimestamp(lastAt, now);
        const role = ROLE_LABELS[other.role] ?? other.role;

        return (
          <button
            key={conversation.conversationId}
            type="button"
            onClick={() => onPick(conversation.conversationId)}
            className={`relative flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors focus:outline-none focus-visible:bg-surface-container-low ${
              active ? 'bg-primary/5' : 'hover:bg-surface-container-low'
            }`}
            title={
              lastAt
                ? `${other.username} · last message ${new Date(
                    lastAt,
                  ).toLocaleString('en-PH')}`
                : other.username
            }
          >
            {active && (
              <span className="absolute inset-y-2 left-0 w-0.5 bg-primary" />
            )}

            <span className="relative shrink-0">
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-full text-[11px] font-bold ${
                  active
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-high text-on-surface-variant'
                }`}
              >
                {initials(other.username)}
              </span>
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface ${
                  presence.online ? 'bg-emerald-500' : 'bg-slate-400'
                }`}
                title={presence.label}
                aria-label={presence.label}
              />
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span
                  className={`truncate text-[13px] ${
                    unread
                      ? 'font-bold text-on-surface'
                      : 'font-semibold text-on-surface'
                  }`}
                >
                  {other.username}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-on-surface-variant">
                  {stamp}
                </span>
              </span>

              <span className="mt-0.5 flex items-center gap-2">
                <span
                  className={`min-w-0 flex-1 truncate text-[11px] ${
                    unread
                      ? 'font-medium text-on-surface'
                      : 'text-on-surface-variant'
                  }`}
                >
                  {conversation.lastMessage
                    ? conversation.lastMessage.senderId === other.userId
                      ? conversation.lastMessage.body
                      : `You: ${conversation.lastMessage.body}`
                    : 'No messages yet'}
                </span>
                {unread && (
                  <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-on-primary">
                    {conversation.unreadCount > 99
                      ? '99+'
                      : conversation.unreadCount}
                  </span>
                )}
              </span>

              <span className="mt-0.5 block truncate text-[10px] text-on-surface-variant/80">
                {role}
                {other.deptCode ? ` · ${other.deptCode}` : ''}
                {' · '}
                <span
                  className={
                    presence.online
                      ? 'font-semibold text-emerald-600'
                      : undefined
                  }
                >
                  {presence.label}
                </span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
