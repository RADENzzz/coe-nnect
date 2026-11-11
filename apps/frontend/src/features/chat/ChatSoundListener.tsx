import { useEffect } from 'react';
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
 * Plays the chat alert for messages pushed over the notification socket.
 *
 * Mounted inside the global NotificationSocketProvider, so the sound works
 * even when the chat drawer is closed. The backend only pushes to the other
 * participant(s), never the sender.
 */
export default function ChatSoundListener() {
  const { subscribe } = useNotificationSocket();

  useEffect(
    () =>
      subscribe<ChatPushPayload>('chat:new', (payload) => {
        if (!payload?.messageId) return;
        playChatSound();
      }),
    [subscribe],
  );

  return null;
}
