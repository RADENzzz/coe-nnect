import { useState } from 'react';
import Icon from '../../components/ui/Icon';
import ChatDrawer from './ChatDrawer';
import { useConversations } from '../../hooks/use-chat-conversations';
import { useAuthStore } from '../../store/auth.store';

type State = 'closed' | 'minimized' | 'open';

export default function ChatWidget() {
  const [state, setState] = useState<State>('closed');
  const profile = useAuthStore((s) => s.profile);
  const { data: conversations = [] } = useConversations(true);

  // Viewers don't see chat (CH-1.9).
  if (profile?.role === 'viewer') return null;

  const totalUnread = conversations.reduce(
    (sum, c) => sum + (c.unreadCount ?? 0),
    0,
  );

  return (
    <>
      {state === 'open' && (
        <ChatDrawer
          onMinimize={() => setState('minimized')}
          onClose={() => setState('closed')}
        />
      )}

      {state === 'minimized' && (
        <button
          onClick={() => setState('open')}
          style={{
            position: 'fixed',
            right: 12,
            bottom: 'calc(72px + env(safe-area-inset-bottom))',
            zIndex: 40,
          }}
          className="
            md:!right-6 md:!bottom-6
            bg-[#5c1219] text-white shadow-card
            flex items-center gap-2 pl-3 pr-4 py-2.5
            hover:bg-[#6b1620] active:bg-[#4a0e14]
            transition-colors
          "
        >
          <Icon name="forum" size={16} />
          <span className="text-xs font-semibold">Chat</span>
          {totalUnread > 0 && (
            <span className="text-[10px] bg-white text-[#5c1219] font-bold min-w-[18px] h-[18px] px-1 flex items-center justify-center">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>
      )}

      {state === 'closed' && (
        <button
          onClick={() => setState('open')}
          style={{
            position: 'fixed',
            right: 12,
            bottom: 'calc(72px + env(safe-area-inset-bottom))',
            zIndex: 40,
          }}
          className="
            md:!right-6 md:!bottom-6
            w-12 h-12 md:w-14 md:h-14
            bg-[#5c1219] text-white shadow-card
            flex items-center justify-center
            hover:bg-[#6b1620] active:bg-[#4a0e14]
            transition-colors
          "
          aria-label="Open chat"
          title="Chat"
        >
          <Icon name="forum" size={22} />
          {totalUnread > 0 && (
            <span
              className="
                absolute -top-1.5 -right-1.5
                min-w-[20px] h-[20px] px-1
                bg-red-600 text-white text-[10px] font-bold
                flex items-center justify-center
                border-2 border-white
              "
            >
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </button>
      )}
    </>
  );
}