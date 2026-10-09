import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchConversations,
  createConversation,
  type ConversationSummary,
} from '../api/chat.api';

/**
 * List my conversations with last message + unread count.
 * Refetch interval keeps the sidebar fresh even without realtime.
 */
export function useConversations(enabled: boolean = true) {
  return useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: fetchConversations,
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000, // fallback refresh; realtime handles new messages
  });
}

/**
 * Create (or return existing) direct conversation with another user.
 * Invalidates the conversations list so the new room shows up.
 */
export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (otherUserId: string) => createConversation(otherUserId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    },
  });
}

/**
 * Convenience: find an existing conversation with a given user.
 * Returns null if none exists yet.
 */
export function findConversationWith(
  conversations: ConversationSummary[],
  userId: string,
): ConversationSummary | null {
  return (
    conversations.find((c) => c.otherUser?.userId === userId) ?? null
  );
}