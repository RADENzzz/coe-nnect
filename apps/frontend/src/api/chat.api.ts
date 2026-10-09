import { api } from './client';

export type ChatUserRole =
  | 'administrator'
  | 'college_dean'
  | 'department_head'
  | 'viewer';

export interface ChatUser {
  userId: string;
  username: string;
  role: ChatUserRole;
  deptId: string | null;
}

export interface ConversationSummary {
  conversationId: string;
  otherUser: {
    userId: string;
    username: string;
    role: ChatUserRole;
    deptId: string | null;
  } | null;
  lastMessage: {
    messageId: string;
    senderId: string;
    body: string;
    createdAt: string;
  } | null;
  unreadCount: number;
  lastReadAt: string | null;
}

export interface ChatMessage {
  messageId: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

/**
 * Normalize a server message payload. The backend returns camelCase
 * (`messageId`, `createdAt`), but realtime snapshots and older caches
 * may drift. Normalize everything to ChatMessage here.
 */
function normalizeMessage(raw: any): ChatMessage {
  return {
    messageId: String(raw.messageId ?? raw.message_id ?? ''),
    conversationId: String(raw.conversationId ?? raw.conversation_id ?? ''),
    senderId: String(raw.senderId ?? raw.sender_id ?? ''),
    body: String(raw.body ?? ''),
    createdAt: String(
      raw.createdAt ?? raw.created_at ?? new Date().toISOString(),
    ),
  };
}

function normalizeConversation(raw: any): ConversationSummary {
  return {
    conversationId: String(raw.conversationId ?? ''),
    otherUser: raw.otherUser
      ? {
          userId: String(raw.otherUser.userId ?? ''),
          username: String(raw.otherUser.username ?? ''),
          role: raw.otherUser.role,
          deptId: raw.otherUser.deptId ?? null,
        }
      : null,
    lastMessage: raw.lastMessage
      ? {
          messageId: String(raw.lastMessage.messageId ?? ''),
          senderId: String(raw.lastMessage.senderId ?? ''),
          body: String(raw.lastMessage.body ?? ''),
          createdAt: String(
            raw.lastMessage.createdAt ??
              raw.lastMessage.created_at ??
              new Date().toISOString(),
          ),
        }
      : null,
    unreadCount: Number(raw.unreadCount ?? 0),
    lastReadAt: raw.lastReadAt ?? null,
  };
}

export async function fetchEligibleUsers(): Promise<ChatUser[]> {
  const { data } = await api.get('/v1/chat/users');
  return data.data;
}

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const { data } = await api.get('/v1/chat/conversations');
  return (data.data as any[]).map(normalizeConversation);
}

export async function createConversation(
  otherUserId: string,
): Promise<{ conversationId: string; created: boolean }> {
  const { data } = await api.post('/v1/chat/conversations', { otherUserId });
  return data.data;
}

export async function fetchMessages(
  conversationId: string,
  before?: string,
  limit = 50,
): Promise<ChatMessage[]> {
  const { data } = await api.get(
    `/v1/chat/conversations/${conversationId}/messages`,
    { params: { before, limit } },
  );
  return (data.data as any[]).map(normalizeMessage);
}

export async function sendMessage(
  conversationId: string,
  body: string,
): Promise<ChatMessage> {
  const { data } = await api.post(
    `/v1/chat/conversations/${conversationId}/messages`,
    { body },
  );
  return normalizeMessage(data.data);
}

export async function markRead(conversationId: string): Promise<void> {
  await api.patch(`/v1/chat/conversations/${conversationId}/read`);
}