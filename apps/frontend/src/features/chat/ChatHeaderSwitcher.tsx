import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/ui/Icon';
import ConversationList from './ConversationList';
import OnlineUserList from './OnlineUserList';
import type { ConversationSummary } from './types';
import type { OnlineUser } from '../../hooks/use-online-users';

function initials(username: string): string {
  if (!username) return '—';
  return username.slice(0, 2).toUpperCase();
}

const ROLE_LABELS: Record<string, string> = {
  administrator: 'Admin',
  college_dean: 'Dean',
  department_head: 'DH',
  viewer: 'Viewer',
};

interface Props {
  /** Currently selected conversation (may be null for the empty state). */
  activeConversation: ConversationSummary | null;
  /** Is the other user currently online? */
  activeIsOnline: boolean;
  /** All my conversations, for the dropdown. */
  conversations: ConversationSummary[];
  /** All online eligible users, for the dropdown. */
  onlineUsers: OnlineUser[];
  /** Fired when user picks a conversation from the dropdown. */
  onPickConversation: (conversationId: string) => void;
  /** Fired when user picks an online user (creates a conversation if needed). */
  onPickUser: (userId: string) => void;
  /** Optional badge showing total unread across all conversations. */
  totalUnread: number;
}

export default function ChatHeaderSwitcher({
  activeConversation,
  activeIsOnline,
  conversations,
  onlineUsers,
  onPickConversation,
  onPickUser,
  totalUnread,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const other = activeConversation?.otherUser ?? null;

  return (
    <div ref={wrapperRef} className="relative border-b border-slate-200 shrink-0 bg-white">
      {/* Header bar — click to open dropdown */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2.5 flex items-center gap-2.5 hover:bg-slate-50 transition-colors text-left"
      >
        {other ? (
          <>
            <div className="relative shrink-0">
              <div className="w-9 h-9 bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center">
                {initials(other.username)}
              </div>
              {activeIsOnline && (
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 truncate leading-tight">
                {other.username}
              </p>
              <p className="text-[10px] text-slate-500 truncate leading-tight flex items-center gap-1.5">
                <span className="font-semibold uppercase tracking-wider text-[9px] text-[#5c1219]">
                  {ROLE_LABELS[other.role] ?? other.role}
                </span>
                <span>·</span>
                <span>{activeIsOnline ? 'Online' : 'Offline'}</span>
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="w-9 h-9 bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
              <Icon name="person_add" size={16} className="text-slate-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-700 truncate leading-tight">
                No active chat
              </p>
              <p className="text-[10px] text-slate-500 truncate leading-tight">
                Click to pick someone
              </p>
            </div>
          </>
        )}

        {totalUnread > 0 && (
          <span className="text-[10px] bg-red-600 text-white font-bold min-w-[18px] h-[18px] px-1 flex items-center justify-center shrink-0">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}

        <Icon
          name="expand_more"
          size={18}
          className={`text-slate-400 shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 bg-white border border-slate-200 shadow-card max-h-[420px] overflow-y-auto">
          {/* Chats section */}
          <div className="border-b border-slate-100">
            <div className="px-3 pt-2.5 pb-1 flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Active Chats
              </span>
              {conversations.length > 0 && (
                <span className="text-[9px] text-slate-400">
                  {conversations.length}
                </span>
              )}
            </div>
            <ConversationList
              conversations={conversations}
              activeConversationId={activeConversation?.conversationId ?? null}
              onPick={(id) => {
                onPickConversation(id);
                setOpen(false);
              }}
              dense
            />
          </div>

          {/* Online section */}
          <div>
            <div className="px-3 pt-2.5 pb-1 flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Online Now
              </span>
              {onlineUsers.length > 0 && (
                <span className="text-[9px] text-slate-400">
                  {onlineUsers.length}
                </span>
              )}
            </div>
            <OnlineUserList
              users={onlineUsers}
              activeUserId={null}
              onPick={(userId) => {
                onPickUser(userId);
                setOpen(false);
              }}
              dense
            />
          </div>
        </div>
      )}
    </div>
  );
}