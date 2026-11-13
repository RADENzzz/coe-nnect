import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '../../components/ui/Icon';
import { useAuthStore } from '../../store/auth.store';
import { useOnlineUsers } from '../../hooks/use-online-users';
import { useNow } from '../../hooks/use-now';
import {
  useConversations,
  useCreateConversation,
  findConversationWith,
} from '../../hooks/use-chat-conversations';
import {
  useChatMessages,
  useSendMessage,
  useMarkRead,
} from '../../hooks/use-chat-messages';
import { fetchEligibleUsers } from '../../api/chat.api';
import MessageThread from './MessageThread';
import MessageComposer from './MessageComposer';
import ConversationList from './ConversationList';
import ChatPeopleList from './ChatPeopleList';
import { formatChatPresence } from './presence';
import type { PresenceResolver } from './types';

interface Props {
  onClose: () => void;
}

const LS_LAST_CONV_KEY = 'coe-nnect:chat-last-conversation';

const ROLE_LABELS: Record<string, string> = {
  administrator: 'Admin',
  college_dean: 'Dean',
  department_head: 'Department Head',
  college_secretary: 'College Secretary',
  viewer: 'Viewer',
};

function initials(username: string): string {
  if (!username) return '—';
  return username.slice(0, 2).toUpperCase();
}

type ListMode = 'conversations' | 'people';
type MobilePane = 'list' | 'thread';

export default function ChatDrawer({ onClose }: Props) {
  const profile = useAuthStore((s) => s.profile);
  const { onlineUsers } = useOnlineUsers();
  const now = useNow(30_000);
  const searchRef = useRef<HTMLInputElement>(null);

  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(() => {
    try {
      return sessionStorage.getItem(LS_LAST_CONV_KEY) || null;
    } catch {
      return null;
    }
  });
  const [listMode, setListMode] = useState<ListMode>('conversations');
  const [mobilePane, setMobilePane] = useState<MobilePane>('list');
  const [query, setQuery] = useState('');
  const [startingUserId, setStartingUserId] = useState<string | null>(null);

  // The thread is always visible on desktop; on mobile it only counts as
  // "open" once the user navigates into it. Used to avoid clearing unread
  // badges for a conversation that is still behind the list pane.
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia('(min-width: 768px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const { data: conversations = [], isLoading: conversationsLoading } =
    useConversations(true);

  const { data: eligibleUsers = [], isLoading: peopleLoading } = useQuery({
    queryKey: ['chat', 'eligible-users'],
    queryFn: fetchEligibleUsers,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: messages = [], isLoading: messagesLoading } = useChatMessages(
    activeConversationId,
    true,
  );

  const createConversation = useCreateConversation();
  const sendMessage = useSendMessage(activeConversationId);
  const markRead = useMarkRead();

  // The hidden dev/administrator account is not a chat participant from the
  // user's point of view. Filter defensively as well as on the API.
  const visibleConversations = useMemo(
    () =>
      conversations.filter(
        (conversation) =>
          conversation.otherUser?.role !== 'administrator',
      ),
    [conversations],
  );

  const chatPeople = useMemo(
    () => eligibleUsers.filter((user) => user.role !== 'administrator'),
    [eligibleUsers],
  );

  // ── Presence ─────────────────────────────────────────────────────────
  // Realtime tells us who is online right now. When someone drops off, we
  // remember the moment locally so their label becomes "Active just now"
  // immediately, without waiting for the next directory refetch.
  const [offlineAt, setOfflineAt] = useState<Record<string, number>>({});
  const offlineAtRef = useRef<Record<string, number>>({});
  const previousOnlineRef = useRef<Set<string>>(new Set());

  const onlineIds = useMemo(
    () => new Set(onlineUsers.map((user) => user.user_id)),
    [onlineUsers],
  );

  useEffect(() => {
    const current = new Set(onlineUsers.map((user) => user.user_id));
    const next = { ...offlineAtRef.current };
    let changed = false;

    for (const id of previousOnlineRef.current) {
      if (!current.has(id)) {
        next[id] = Date.now();
        changed = true;
      }
    }
    for (const id of current) {
      if (next[id] !== undefined) {
        delete next[id];
        changed = true;
      }
    }

    previousOnlineRef.current = current;
    offlineAtRef.current = next;
    if (changed) setOfflineAt(next);
  }, [onlineUsers]);

  const presenceFor = useCallback<PresenceResolver>(
    (userId, lastSeenAt) => {
      const online = onlineIds.has(userId);
      const local = offlineAt[userId];
      const server = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
      const seen = Math.max(
        local ?? 0,
        Number.isFinite(server) ? server : 0,
      );

      return formatChatPresence(online, seen || null, now);
    },
    [onlineIds, offlineAt, now],
  );

  // Persist last conversation
  useEffect(() => {
    try {
      if (activeConversationId) {
        sessionStorage.setItem(LS_LAST_CONV_KEY, activeConversationId);
      }
    } catch {
      /* ignore */
    }
  }, [activeConversationId]);

  // Auto-select the most recent conversation on desktop.
  useEffect(() => {
    if (
      activeConversationId &&
      visibleConversations.some(
        (c) => c.conversationId === activeConversationId,
      )
    ) {
      return;
    }
    if (visibleConversations.length === 0) return;

    const sorted = [...visibleConversations].sort((a, b) => {
      const ta = a.lastMessage?.createdAt
        ? new Date(a.lastMessage.createdAt).getTime()
        : 0;
      const tb = b.lastMessage?.createdAt
        ? new Date(b.lastMessage.createdAt).getTime()
        : 0;
      return tb - ta;
    });
    setActiveConversationId(sorted[0].conversationId);
  }, [visibleConversations, activeConversationId]);

  // Auto-mark read when opening
  useEffect(() => {
    if (!activeConversationId) return;
    if (!isDesktop && mobilePane !== 'thread') return;
    const conversation = visibleConversations.find(
      (c) => c.conversationId === activeConversationId,
    );
    if (conversation && conversation.unreadCount > 0) {
      markRead.mutate(activeConversationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeConversationId,
    visibleConversations,
    isDesktop,
    mobilePane,
  ]);

  const activeConversation = useMemo(
    () =>
      visibleConversations.find(
        (c) => c.conversationId === activeConversationId,
      ) ?? null,
    [visibleConversations, activeConversationId],
  );

  const activeOtherUser = activeConversation?.otherUser ?? null;
  const activePresence = activeOtherUser
    ? presenceFor(activeOtherUser.userId, activeOtherUser.lastSeenAt)
    : null;

  const onlineCount = useMemo(
    () => chatPeople.filter((u) => onlineIds.has(u.userId)).length,
    [chatPeople, onlineIds],
  );

  const totalUnread = useMemo(
    () =>
      visibleConversations.reduce((sum, c) => sum + c.unreadCount, 0),
    [visibleConversations],
  );

  const focusSearch = () => {
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const openPeople = () => {
    setListMode('people');
    setMobilePane('list');
    setQuery('');
    focusSearch();
  };

  const backToConversations = () => {
    setListMode('conversations');
    setQuery('');
    focusSearch();
  };

  const handlePickConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
    setMobilePane('thread');
    setListMode('conversations');
    setQuery('');
  };

  const handlePickUser = async (userId: string) => {
    const existing = findConversationWith(visibleConversations, userId);
    if (existing) {
      handlePickConversation(existing.conversationId);
      return;
    }

    setStartingUserId(userId);
    try {
      const result = await createConversation.mutateAsync(userId);
      setActiveConversationId(result.conversationId);
      setMobilePane('thread');
      setListMode('conversations');
      setQuery('');
    } catch (error) {
      console.error('Failed to create conversation:', error);
    } finally {
      setStartingUserId(null);
    }
  };

  const handleSend = (body: string) => {
    if (!activeConversationId) return;
    sendMessage.mutate(body);
  };

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 z-[45] animate-backdrop-in bg-black/30 md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-label="Chat"
        className="
          fixed inset-x-0 bottom-0 z-[46] flex h-[100dvh] flex-col overflow-hidden
          border border-outline-variant bg-surface shadow-2xl
          animate-slide-up md:animate-fade-up
          sm:h-[660px] sm:max-h-[calc(100dvh-2rem)]
          md:inset-x-auto md:bottom-6 md:right-6 md:h-[640px] md:max-h-[calc(100dvh-6rem)]
          md:w-[760px] md:max-w-[calc(100vw-3rem)]
        "
      >
        {/* Window chrome */}
        <header className="flex shrink-0 items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon name="forum" size={17} />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold leading-tight text-on-surface">
              Messages
            </h3>
            <p className="mt-0.5 truncate text-[10px] leading-tight text-on-surface-variant">
              {onlineCount} online · {visibleConversations.length} conversation
              {visibleConversations.length === 1 ? '' : 's'}
              {totalUnread > 0 && (
                <>
                  {' · '}
                  <span className="font-semibold text-primary">
                    {totalUnread} unread
                  </span>
                </>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={openPeople}
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-label="New message"
            title="New message"
          >
            <Icon name="edit" size={16} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-label="Close chat"
            title="Close (Esc)"
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* ── Conversation / people list ── */}
          <aside
            className={`w-full flex-col border-outline-variant bg-surface md:flex md:w-[300px] md:shrink-0 md:border-r ${
              mobilePane === 'thread' ? 'hidden' : 'flex'
            }`}
          >
            <div className="shrink-0 border-b border-outline-variant/70 px-3 py-2.5">
              <div className="flex items-center gap-2 bg-surface-container-low px-2.5 py-1.5">
                <Icon
                  name="search"
                  size={14}
                  className="shrink-0 text-on-surface-variant"
                />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={
                    listMode === 'people'
                      ? 'Search people…'
                      : 'Search conversations…'
                  }
                  className="min-w-0 flex-1 bg-transparent text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="shrink-0 p-0.5 text-on-surface-variant hover:text-on-surface"
                    aria-label="Clear search"
                  >
                    <Icon name="close" size={12} />
                  </button>
                )}
              </div>
            </div>

            {listMode === 'people' ? (
              <>
                <div className="flex shrink-0 items-center gap-2 border-b border-outline-variant/70 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={backToConversations}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    aria-label="Back to conversations"
                  >
                    <Icon name="arrow_back" size={15} />
                  </button>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">
                    New message
                  </p>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                  {peopleLoading ? (
                    <div className="px-4 py-10 text-center">
                      <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
                      <p className="mt-3 text-[11px] text-on-surface-variant">
                        Loading people…
                      </p>
                    </div>
                  ) : (
                    <ChatPeopleList
                      users={chatPeople}
                      presenceFor={presenceFor}
                      onPick={handlePickUser}
                      activeUserId={activeOtherUser?.userId ?? null}
                      query={query}
                      startingUserId={startingUserId}
                    />
                  )}
                </div>
              </>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <ConversationList
                  conversations={visibleConversations}
                  activeConversationId={activeConversationId}
                  onPick={handlePickConversation}
                  presenceFor={presenceFor}
                  isLoading={conversationsLoading}
                  now={now}
                  query={query}
                  onStartNew={openPeople}
                />

                {visibleConversations.length > 0 && (
                  <div className="border-t border-outline-variant/60 p-3">
                    <button
                      type="button"
                      onClick={openPeople}
                      className="flex w-full items-center justify-center gap-1.5 border border-outline-variant bg-surface px-3 py-2 text-[11px] font-semibold text-on-surface transition-colors hover:bg-surface-container-low focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    >
                      <Icon name="edit" size={13} />
                      New message
                    </button>
                  </div>
                )}
              </div>
            )}
          </aside>

          {/* ── Active thread ── */}
          <section
            className={`min-w-0 flex-1 flex-col bg-surface ${
              mobilePane === 'thread' ? 'flex' : 'hidden md:flex'
            }`}
          >
            {activeOtherUser ? (
              <>
                <div className="flex shrink-0 items-center gap-3 border-b border-outline-variant px-3 py-2.5 sm:px-4">
                  <button
                    type="button"
                    onClick={() => setMobilePane('list')}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 md:hidden"
                    aria-label="Back to conversations"
                  >
                    <Icon name="arrow_back" size={17} />
                  </button>

                  <span className="relative shrink-0">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-high text-[10px] font-bold text-on-surface-variant">
                      {initials(activeOtherUser.username)}
                    </span>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface ${
                        activePresence?.online
                          ? 'bg-emerald-500'
                          : 'bg-slate-400'
                      }`}
                      aria-hidden="true"
                    />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold leading-tight text-on-surface">
                      {activeOtherUser.username}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] leading-tight">
                      <span
                        className={
                          activePresence?.online
                            ? 'font-semibold text-emerald-600'
                            : 'text-on-surface-variant'
                        }
                      >
                        {activePresence?.label ?? 'Offline'}
                      </span>
                      <span className="text-on-surface-variant/40">·</span>
                      <span className="truncate text-on-surface-variant">
                        {ROLE_LABELS[activeOtherUser.role] ??
                          activeOtherUser.role}
                        {activeOtherUser.deptCode
                          ? ` · ${activeOtherUser.deptCode}`
                          : ''}
                      </span>
                    </p>
                  </div>
                </div>

                <MessageThread
                  messages={messages}
                  selfUserId={profile?.user_id ?? ''}
                  otherName={activeOtherUser.username}
                  isLoading={messagesLoading}
                />
                <MessageComposer
                  onSend={handleSend}
                  conversationId={activeConversationId ?? undefined}
                  disabled={sendMessage.isPending}
                />
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant/60">
                  <Icon name="chat_bubble_outline" size={30} />
                </div>
                <p className="text-sm font-semibold text-on-surface">
                  Your messages
                </p>
                <p className="mt-1 max-w-[260px] text-xs leading-snug text-on-surface-variant">
                  Select a conversation from the list or start a new one with a
                  dean or department head.
                </p>
                <button
                  type="button"
                  onClick={openPeople}
                  className="mt-4 inline-flex items-center gap-1.5 bg-primary px-3.5 py-2 text-[11px] font-semibold text-on-primary transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <Icon name="edit" size={13} />
                  New message
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
