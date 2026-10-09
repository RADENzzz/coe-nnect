import { useState } from 'react';
import Icon from '../../components/ui/Icon';
import ChatDrawer from './ChatDrawer';
import { useConversations } from '../../hooks/use-chat-conversations';
import { useAuthStore } from '../../store/auth.store';

type State = 'closed' | 'open';

export default function ChatWidget() {
  const [state, setState] = useState<State>('closed');
  const profile = useAuthStore((s) => s.profile);
  const { data: conversations = [] } = useConversations(true);

  // Viewers don't see the chat widget (CH-1.9).
  if (profile?.role === 'viewer') return null;

  const totalUnread = conversations.reduce(
    (sum, c) => sum + (c.unreadCount ?? 0),
    0,
  );

  return (
    <>
      {state === 'open' && (
        <ChatDrawer onClose={() => setState('closed')} />
      )}

      {state === 'closed' && (
        <button
          onClick={() => setState('open')}
          style={{
            position: 'fixed',
            right: 0,
            bottom: 'calc(72px + env(safe-area-inset-bottom))',
            zIndex: 40,
          }}
          className="
            md:!bottom-6
            w-11 h-11
            bg-[#5c1219] text-white
            hover:bg-[#6b1620] active:bg-[#4a0e14]
            flex items-center justify-center
            transition-colors
            relative
          "
          aria-label="Open chat"
          title="Chat"
        >
          <Icon name="forum" size={20} />
          {totalUnread > 0 && (
            <span
              className="
                absolute top-0 left-0
                min-w-[16px] h-[16px] px-1
                bg-red-600 text-white text-[9px] font-bold
                flex items-center justify-center
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