import { useEffect, useMemo, useRef, useState } from 'react';
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

type Tab = 'chats' | 'online';

interface Props {
  activeConversation: ConversationSummary | null;
  activeIsOnline: boolean;
  conversations: ConversationSummary[];
  onlineUsers: OnlineUser[];
  onPickConversation: (conversationId: string) => void;
  onPickUser: (userId: string) => void;
  totalUnread: number;
  isLoading?: boolean;
}

export default function ChatHeaderSwitcher({
  activeConversation,
  activeIsOnline,
  conversations,
  onlineUsers,
  onPickConversation,
  onPickUser,
  totalUnread,
  isLoading,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('chats');
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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

  // Escape to close; auto-focus search
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => searchRef.current?.focus());
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setQuery('');
      // Keep `tab` so re-opening goes to last-used tab
    }
  }, [open]);

  const other = activeConversation?.otherUser ?? null;

  // Filtered lists
  const filteredConversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) =>
      c.otherUser?.username.toLowerCase().includes(q),
    );
  }, [conversations, query]);

  const filteredOnline = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return onlineUsers;
    return onlineUsers.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        (u.dept_name ?? '').toLowerCase().includes(q) ||
        (u.dept_code ?? '').toLowerCase().includes(q),
    );
  }, [onlineUsers, query]);

  return (
    <div
      ref={wrapperRef}
      className="relative border-b border-slate-200 shrink-0 bg-white"
    >
      {/* Header bar — click to open dropdown */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full px-3 py-2.5 flex items-center gap-2.5 hover:bg-slate-50 transition-colors text-left focus:outline-none focus-visible:bg-slate-50"
      >
        {other ? (
          <>
            <div className="relative shrink-0">
              <div className="w-9 h-9 bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center rounded-full">
                {initials(other.username)}
              </div>
              {activeIsOnline && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"
                  aria-label="Online"
                />
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
                <span>
                  {activeIsOnline ? (
                    <span className="text-emerald-600 font-semibold">
                      Online
                    </span>
                  ) : (
                    'Offline'
                  )}
                </span>
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="w-9 h-9 bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 rounded-full">
              <Icon name="person_add" size={16} className="text-slate-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-700 truncate leading-tight">
                No active chat
              </p>
              <p className="text-[10px] text-slate-500 truncate leading-tight">
                {onlineUsers.length > 0
                  ? `${onlineUsers.length} ${
                      onlineUsers.length === 1 ? 'person' : 'people'
                    } online`
                  : 'Click to pick someone'}
              </p>
            </div>
          </>
        )}

        {totalUnread > 0 && (
          <span className="text-[10px] bg-red-600 text-white font-bold min-w-[18px] h-[18px] px-1 flex items-center justify-center shrink-0 rounded-full">
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
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 bg-white border border-slate-200 shadow-xl max-h-[440px] flex flex-col animate-fade-in rounded-b-lg overflow-hidden"
        >
          {/* Search + tabs */}
          <div className="border-b border-slate-100">
            <div className="px-3 py-2 flex items-center gap-2">
              <Icon
                name="search"
                size={14}
                className="text-slate-400 shrink-0"
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people or chats…"
                className="flex-1 text-xs bg-transparent focus:outline-none placeholder:text-slate-400"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-slate-400 hover:text-slate-700 p-0.5"
                  aria-label="Clear search"
                >
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>

            <div className="flex px-2 pb-1 gap-1">
              <button
                type="button"
                onClick={() => setTab('chats')}
                className={`flex-1 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition ${
                  tab === 'chats'
                    ? 'bg-[#5c1219] text-white'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                Chats
                {conversations.length > 0 && (
                  <span
                    className={`ml-1.5 text-[9px] ${
                      tab === 'chats' ? 'opacity-80' : 'text-slate-400'
                    }`}
                  >
                    {conversations.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setTab('online')}
                className={`flex-1 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition ${
                  tab === 'online'
                    ? 'bg-[#5c1219] text-white'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                Online
                {onlineUsers.length > 0 && (
                  <span
                    className={`ml-1.5 text-[9px] ${
                      tab === 'online' ? 'opacity-80' : 'text-slate-400'
                    }`}
                  >
                    {onlineUsers.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {tab === 'chats' ? (
              filteredConversations.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Icon
                    name="forum"
                    size={24}
                    className="text-slate-300 mx-auto mb-2"
                  />
                  <p className="text-xs text-slate-500">
                    {query
                      ? `No chats match "${query}"`
                      : conversations.length === 0
                      ? 'No conversations yet'
                      : 'No conversations to show'}
                  </p>
                  {!query && conversations.length === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setTab('online');
                        setQuery('');
                      }}
                      className="mt-3 text-[11px] font-semibold text-[#5c1219] hover:underline"
                    >
                      See who's online →
                    </button>
                  )}
                </div>
              ) : (
                <ConversationList
                  conversations={filteredConversations}
                  activeConversationId={
                    activeConversation?.conversationId ?? null
                  }
                  onPick={(id) => {
                    onPickConversation(id);
                    setOpen(false);
                  }}
                  dense
                />
              )
            ) : filteredOnline.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Icon
                  name="person_off"
                  size={24}
                  className="text-slate-300 mx-auto mb-2"
                />
                <p className="text-xs text-slate-500">
                  {query
                    ? `No one matches "${query}"`
                    : 'No one else is online right now'}
                </p>
              </div>
            ) : (
              <OnlineUserList
                users={filteredOnline}
                activeUserId={other?.userId ?? null}
                onPick={(userId) => {
                  onPickUser(userId);
                  setOpen(false);
                }}
                dense
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}