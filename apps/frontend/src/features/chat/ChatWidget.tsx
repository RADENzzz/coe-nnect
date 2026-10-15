import { useEffect, useState } from 'react';
import Icon from '../../components/ui/Icon';
import ChatDrawer from './ChatDrawer';
import { useConversations } from '../../hooks/use-chat-conversations';
import { useAuthStore } from '../../store/auth.store';

type State = 'closed' | 'open';

const LS_OPEN_STATE_KEY = 'coe-nnect:chat-open';

export default function ChatWidget() {
  const [state, setState] = useState<State>(() => {
    // Restore open state across navigations within the session
    try {
      const saved = sessionStorage.getItem(LS_OPEN_STATE_KEY);
      return saved === 'open' ? 'open' : 'closed';
    } catch {
      return 'closed';
    }
  });
  const [pulse, setPulse] = useState(false);

  const profile = useAuthStore((s) => s.profile);
  const { data: conversations = [] } = useConversations(true);

  const totalUnread = conversations.reduce(
    (sum, c) => sum + (c.unreadCount ?? 0),
    0,
  );

  // Pulse the badge briefly when unread count changes
  useEffect(() => {
    if (totalUnread === 0) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 800);
    return () => clearTimeout(t);
  }, [totalUnread]);

  // Persist open/closed state
  useEffect(() => {
    try {
      sessionStorage.setItem(LS_OPEN_STATE_KEY, state);
    } catch {
      /* ignore */
    }
  }, [state]);

  // Escape to close when open
  useEffect(() => {
    if (state !== 'open') return;
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack Escape if a modal is open on top — modals handle their own.
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-modal="true"]')) {
        setState('closed');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state]);

  // Viewers don't see the chat widget (CH-1.9)
  if (profile?.role === 'viewer') return null;

  return (
    <>
      {state === 'open' && <ChatDrawer onClose={() => setState('closed')} />}

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
            md:!bottom-6 md:!right-6
            w-11 h-11 md:w-12 md:h-12
            bg-[#5c1219] text-white
            hover:bg-[#6b1620] active:bg-[#4a0e14]
            flex items-center justify-center
            transition-all duration-150
            hover:scale-105 hover:shadow-lg
            active:scale-95
            relative
            rounded-full
            focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219] focus-visible:ring-offset-2
          "
          aria-label={
            totalUnread > 0
              ? `Open chat, ${totalUnread} unread message${totalUnread === 1 ? '' : 's'}`
              : 'Open chat'
          }
          title={
            totalUnread > 0
              ? `${totalUnread} unread message${totalUnread === 1 ? '' : 's'}`
              : 'Chat'
          }
        >
          <Icon name="forum" size={20} />
          {totalUnread > 0 && (
            <span
              className={`
                absolute -top-1 -left-1
                min-w-[18px] h-[18px] px-1
                bg-red-600 text-white text-[10px] font-bold
                flex items-center justify-center
                rounded-full border-2 border-white
                ${pulse ? 'animate-badge-pop' : ''}
              `}
            >
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </button>
      )}
    </>
  );
}