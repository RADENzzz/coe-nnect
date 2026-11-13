import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNotificationSocket } from '../../hooks/use-notification-socket';
import { playChatSound } from '../../lib/sound';

interface ChatPushPayload {
  conversationId: string;
  messageId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

/**
 * Plays the chat alert for messages pushed over the notification socket and
 * keeps the chat queries fresh.
 *
 * Mounted inside the global NotificationSocketProvider, so the sound and the
 * list refresh work even when the chat drawer is closed. The backend only
 * pushes to the other participant(s), never the sender.
 */
export default function ChatSoundListener() {
  const { subscribe } = useNotificationSocket();
  const queryClient = useQueryClient();

  useEffect(
    () =>
      subscribe<ChatPushPayload>('chat:new', (payload) => {
        if (!payload?.messageId) return;
        playChatSound();

        // A new message changes the conversation preview/unread count, and
        // the open thread (if it is the same conversation) should show it
        // without waiting for the 60s fallback poll.
        queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
        if (payload.conversationId) {
          queryClient.invalidateQueries({
            queryKey: ['chat', 'messages', payload.conversationId],
          });
        }
      }),
    [subscribe, queryClient],
  );

  return null;
}
