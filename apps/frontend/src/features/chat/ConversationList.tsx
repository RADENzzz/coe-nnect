import Icon from '../../components/ui/Icon';
import type { ConversationSummary } from './types';

function initials(username: string): string {
  if (!username) return '—';
  return username.slice(0, 2).toUpperCase();
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return 'now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return d.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  });
}

function fullTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

interface Props {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onPick: (conversationId: string) => void;
  isLoading?: boolean;
  dense?: boolean;
}

export default function ConversationList({
  conversations,
  activeConversationId,
  onPick,
  isLoading,
  dense = false,
}: Props) {
  const rowPadY = dense ? 'py-2' : 'py-2.5';
  const gap = dense ? 'gap-2' : 'gap-2.5';
  const avatarSize = dense ? 'w-8 h-8 text-[10px]' : 'w-9 h-9 text-[11px]';

  if (isLoading && conversations.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-[#5c1219] animate-spin mx-auto rounded-full" />
        <p className="text-[10px] text-slate-400 mt-3">Loading chats…</p>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div
        className={
          dense ? 'px-3 py-5 text-center' : 'px-5 py-10 text-center'
        }
      >
        <Icon
          name="forum"
          className="text-slate-300 mx-auto"
          size={dense ? 18 : 20}
        />
        <p
          className={`text-slate-500 mt-2 leading-snug ${
            dense ? 'text-[10px]' : 'text-xs'
          }`}
        >
          {dense
            ? 'No conversations yet'
            : 'No conversations yet. Pick someone online to start.'}
        </p>
      </div>
    );
  }

  return (
    <div className={dense ? '' : 'divide-y divide-slate-100'}>
      {conversations.map((c) => {
        const other = c.otherUser;
        if (!other) return null;
        const active = c.conversationId === activeConversationId;
        const unread = c.unreadCount > 0;
        const lastAt = c.lastMessage?.createdAt ?? null;

        return (
          <button
            key={c.conversationId}
            onClick={() => onPick(c.conversationId)}
            title={lastAt ? fullTime(lastAt) : undefined}
            className={`w-full px-3 ${rowPadY} flex items-start ${gap} text-left transition-colors relative rounded ${
              active ? 'bg-[#5c1219]/5' : 'hover:bg-slate-50'
            } focus:outline-none focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-[#5c1219]/30`}
          >
            {active && (
              <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-[#5c1219] rounded-r" />
            )}
            <div className="relative shrink-0 mt-0.5">
              <div
                className={`${avatarSize} font-bold flex items-center justify-center transition-colors rounded-full ${
                  active
                    ? 'bg-[#5c1219] text-white'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {initials(other.username)}
              </div>
              {unread && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-600 text-white text-[9px] font-bold flex items-center justify-center border-2 border-white rounded-full">
                  {c.unreadCount > 9 ? '9+' : c.unreadCount}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-1.5">
                <p
                  className={`text-xs truncate ${
                    unread
                      ? 'font-bold text-slate-900'
                      : 'font-semibold text-slate-800'
                  }`}
                >
                  {other.username}
                </p>
                <span className="text-[9px] text-slate-400 shrink-0 tabular-nums">
                  {relativeTime(lastAt)}
                </span>
              </div>
              <p
                className={`text-[11px] truncate mt-0.5 leading-tight ${
                  unread ? 'text-slate-700 font-medium' : 'text-slate-500'
                }`}
              >
                {c.lastMessage
                  ? c.lastMessage.senderId === other.userId
                    ? c.lastMessage.body
                    : `You: ${c.lastMessage.body}`
                  : 'No messages yet'}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}