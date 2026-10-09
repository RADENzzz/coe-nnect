import { useEffect, useMemo, useState } from 'react';
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

export default function ChatDrawer({ onClose }: Props) {
  const profile = useAuthStore((s) => s.profile);
  const { onlineUsers } = useOnlineUsers();

  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);

  const { data: conversations = [] } = useConversations(true);

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

  // Auto-select the most recently active conversation on mount
  useEffect(() => {
    if (activeConversationId || conversations.length === 0) return;
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
    <div
      style={{
        position: 'fixed',
        right: 0,
        bottom: 'calc(72px + env(safe-area-inset-bottom))',
        zIndex: 40,
      }}
      className="
        md:!bottom-6
        bg-white border border-slate-200 border-r-0 shadow-card
        flex flex-col
        w-[calc(100vw-1.5rem)] sm:w-[420px] md:w-[440px]
        h-[70vh] sm:h-[560px] md:h-[600px]
        max-h-[calc(100vh-6rem)]
      "
    >
      {/* Window chrome */}
      <div className="bg-[#5c1219] text-white px-4 py-3 flex items-center gap-2.5 shrink-0">
        <div className="w-7 h-7 bg-white/10 flex items-center justify-center shrink-0">
          <Icon name="forum" size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold leading-tight">Chat</h3>
          <p className="text-[10px] text-white/70 leading-tight">
            {directoryOnline.length} online ·{' '}
            {conversations.length} conversation
            {conversations.length === 1 ? '' : 's'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center hover:bg-white/10 transition-colors"
          aria-label="Close"
          title="Close"
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
            <MessageComposer onSend={handleSend} />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-14 h-14 bg-slate-50 border border-slate-200 flex items-center justify-center mb-3">
              <Icon
                name="chat_bubble_outline"
                className="text-slate-300"
                size={28}
              />
            </div>
            <p className="text-sm font-semibold text-slate-700">
              No active chat
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-[240px]">
              {conversations.length === 0
                ? 'Click the header above to pick someone online.'
                : 'Pick a conversation from the header above.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}