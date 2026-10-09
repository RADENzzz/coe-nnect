/**
 * Chat types.
 *
 * Server shapes live in `api/chat.api.ts` and are re-exported here so
 * feature code imports from one place.
 *
 * `ChatParticipant` is a UI-only shape: the online presence list from
 * `useOnlineUsers` + a merged `isOnline` flag for whoever we're chatting with.
 */

export type {
  ChatUser,
  ChatUserRole,
  ConversationSummary,
  ChatMessage,
} from '../../api/chat.api';

/**
 * A participant shown in the "start new chat" picker. Merges:
 *   - the static directory list from /v1/chat/users
 *   - the live online list from useOnlineUsers
 *
 * Fields are snake_case because `useOnlineUsers` uses snake_case
 * (`user_id`, `dept_name`). The directory list (which is camelCase from
 * the backend) is normalized before being passed here.
 */
export interface ChatParticipant {
  user_id: string;
  username: string;
  role: string;
  dept_id: string | null;
  dept_code: string | null;
  dept_name: string | null;
  isOnline: boolean;
}