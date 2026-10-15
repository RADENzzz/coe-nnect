import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/ui/Icon';
import { useAuthStore } from '../../store/auth.store';
import { useOnlineUsers } from '../../hooks/use-online-users';
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
import { useQuery } from '@tanstack/react-query';
import { fetchEligibleUsers } from '../../api/chat.api';
import MessageThread from './MessageThread';
import MessageComposer from './MessageComposer';
import ChatHeaderSwitcher from './ChatHeaderSwitcher';
import type { OnlineUser } from '../../hooks/use-online-users';

interface Props {
  onClose: () => void;
}

const LS_LAST_CONV_KEY = 'coe-nnect:chat-last-conversation';

export default function ChatDrawer({ onClose }: Props) {
  const profile = useAuthStore((s) => s.profile);
  const { onlineUsers } = useOnlineUsers();
  const drawerRef = useRef<HTMLDivElement>(null);

  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(() => {
    try {
      return sessionStorage.getItem(LS_LAST_CONV_KEY) || null;
    } catch {
      return null;
    }
  });

  const { data: conversations = [], isLoading: conversationsLoading } =
    useConversations(true);

  const { data: eligibleUsers = [] } = useQuery({
    queryKey: ['chat', 'eligible-users'],
    queryFn: fetchEligibleUsers,
    staleTime: 5 * 60 * 1000,
  });

  const { data: messages = [], isLoading: messagesLoading } = useChatMessages(
    activeConversationId,
    true,
  );

  const createConversation = useCreateConversation();
  const sendMessage = useSendMessage(activeConversationId);
  const markRead = useMarkRead();

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

  // Auto-select on mount if nothing restored
  useEffect(() => {
    if (activeConversationId && conversations.some(
      (c) => c.conversationId === activeConversationId,
    )) {
      return;
    }
    if (conversations.length === 0) return;

    const sorted = [...conversations].sort((a, b) => {
      const ta = a.lastMessage?.createdAt
        ? new Date(a.lastMessage.createdAt).getTime()
        : 0;
      const tb = b.lastMessage?.createdAt
        ? new Date(b.lastMessage.createdAt).getTime()
        : 0;
      return tb - ta;
    });
    setActiveConversationId(sorted[0].conversationId);
  }, [conversations, activeConversationId]);

  // Auto-mark read when opening
  useEffect(() => {
    if (!activeConversationId) return;
    const conv = conversations.find(
      (c) => c.conversationId === activeConversationId,
    );
    if (conv && conv.unreadCount > 0) {
      markRead.mutate(activeConversationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, conversations]);

  const activeConversation = useMemo(
    () =>
      conversations.find((c) => c.conversationId === activeConversationId) ??
      null,
    [conversations, activeConversationId],
  );

  const activeOtherUser = activeConversation?.otherUser ?? null;

  const onlineIds = useMemo(
    () => new Set(onlineUsers.map((u) => u.user_id)),
    [onlineUsers],
  );

  const activeIsOnline = activeOtherUser
    ? onlineIds.has(activeOtherUser.userId)
    : false;

  const directoryOnline: OnlineUser[] = useMemo(() => {
    if (!profile) return [];
    const roleOrder: Record<string, number> = {
      administrator: 0,
      college_dean: 1,
      department_head: 2,
      viewer: 3,
    };
    return eligibleUsers
      .filter((u) => u.userId !== profile.user_id)
      .filter((u) => onlineIds.has(u.userId))
      .map((u) => {
        const live = onlineUsers.find((o) => o.user_id === u.userId);
        return {
          user_id: u.userId,
          username: u.username,
          role: u.role,
          dept_id: u.deptId ? Number(u.deptId) : null,
          dept_code: live?.dept_code ?? null,
          dept_name: live?.dept_name ?? null,
          online_at: live?.online_at ?? new Date().toISOString(),
        };
      })
      .sort((a, b) => {
        const r = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
        if (r !== 0) return r;
        return a.username.localeCompare(b.username);
      });
  }, [eligibleUsers, onlineUsers, onlineIds, profile]);

  const handlePickConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
  };

  const handlePickUser = async (userId: string) => {
    const existing = findConversationWith(conversations, userId);
    if (existing) {
      setActiveConversationId(existing.conversationId);
      return;
    }
    try {
      const result = await createConversation.mutateAsync(userId);
      setActiveConversationId(result.conversationId);
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  };

  const handleSend = (body: string) => {
    if (!activeConversationId) return;
    sendMessage.mutate(body);
  };

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unreadCount, 0),
    [conversations],
  );

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="md:hidden fixed inset-0 z-[45] bg-black/30 animate-backdrop-in"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={drawerRef}
        role="dialog"
        aria-label="Chat"
        style={{
          position: 'fixed',
          right: 0,
          bottom: 0,
          zIndex: 46,
        }}
        className="
          md:!bottom-6 md:!right-6
          bg-white border border-slate-200 md:border-r
          shadow-2xl md:shadow-card
          flex flex-col
          w-full sm:w-[420px] md:w-[440px]
          h-[85vh] sm:h-[600px] md:h-[620px]
          max-h-[100vh] md:max-h-[calc(100vh-6rem)]
          rounded-t-xl md:rounded-lg
          animate-slide-up md:animate-fade-up
          overflow-hidden
        "
      >
        {/* Window chrome */}
        <div className="bg-[#5c1219] text-white px-4 py-3 flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 bg-white/10 flex items-center justify-center shrink-0 rounded">
            <Icon name="forum" size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold leading-tight">Chat</h3>
            <p className="text-[10px] text-white/70 leading-tight">
              {directoryOnline.length} online ·{' '}
              {conversations.length} conversation
              {conversations.length === 1 ? '' : 's'}
              {totalUnread > 0 && (
                <>
                  {' · '}
                  <span className="font-bold text-white">
                    {totalUnread} unread
                  </span>
                </>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center hover:bg-white/10 transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            aria-label="Close chat"
            title="Close (Esc)"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Header switcher */}
        <ChatHeaderSwitcher
          activeConversation={activeConversation}
          activeIsOnline={activeIsOnline}
          conversations={conversations}
          onlineUsers={directoryOnline}
          onPickConversation={handlePickConversation}
          onPickUser={handlePickUser}
          totalUnread={totalUnread}
          isLoading={conversationsLoading}
        />

        {/* Body */}
        <div className="flex-1 flex flex-col min-h-0 bg-white">
          {activeOtherUser ? (
            <>
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
          ) : conversationsLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-slate-300 border-t-[#5c1219] animate-spin rounded-full" />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <div className="w-16 h-16 bg-slate-50 border border-slate-200 flex items-center justify-center mb-4 rounded-full">
                <Icon
                  name="chat_bubble_outline"
                  className="text-slate-300"
                  size={32}
                />
              </div>
              <p className="text-sm font-semibold text-slate-700">
                {conversations.length === 0
                  ? 'No conversations yet'
                  : 'No active chat'}
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-[260px]">
                {conversations.length === 0
                  ? directoryOnline.length > 0
                    ? `Pick someone from the header above to start chatting. ${directoryOnline.length} ${
                        directoryOnline.length === 1 ? 'person is' : 'people are'
                      } online right now.`
                    : 'No one else is online yet. Check back shortly.'
                  : 'Pick a conversation from the header above.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}