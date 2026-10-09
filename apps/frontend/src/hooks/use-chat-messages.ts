import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import {
  fetchMessages,
  sendMessage,
  markRead,
  type ChatMessage,
} from '../api/chat.api';

export function useChatMessages(
  conversationId: string | null,
  enabled: boolean = true,
) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['chat', 'messages', conversationId],
    queryFn: () => fetchMessages(conversationId!),
    enabled: enabled && !!conversationId,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!conversationId || !enabled) return;

    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          // Supabase realtime delivers snake_case columns. Be defensive:
          // some edge cases return undefined for fields if RLS blocks partial
          // rows, and old cached payloads might miss fields.
          const raw = payload.new as Record<string, unknown>;

          const createdAt = (() => {
            const v = raw.created_at;
            if (typeof v === 'string' && v.length > 0) return v;
            return new Date().toISOString();
          })();

          const msg: ChatMessage = {
            messageId: String(raw.message_id ?? ''),
            conversationId: String(raw.conversation_id ?? conversationId),
            senderId: String(raw.sender_id ?? ''),
            body: String(raw.body ?? ''),
            createdAt,
          };

          if (!msg.messageId || !msg.senderId) {
            console.warn('[chat] realtime payload missing fields:', raw);
            return;
          }

          qc.setQueryData<ChatMessage[]>(
            ['chat', 'messages', conversationId],
            (old) => {
              if (!old) return [msg];
              if (old.some((m) => m.messageId === msg.messageId)) return old;
              return [...old, msg];
            },
          );

          qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [conversationId, enabled, qc]);

  return query;
}

export function useSendMessage(conversationId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (body: string) => {
      if (!conversationId) throw new Error('No conversation selected');
      return sendMessage(conversationId, body);
    },
    onSuccess: (msg) => {
      qc.setQueryData<ChatMessage[]>(
        ['chat', 'messages', conversationId],
        (old) => {
          if (!old) return [msg];
          if (old.some((m) => m.messageId === msg.messageId)) return old;
          return [...old, msg];
        },
      );
      qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => markRead(conversationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    },
  });
}