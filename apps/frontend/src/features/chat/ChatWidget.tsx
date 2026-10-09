import { useState } from 'react';
import Icon from '../../components/ui/Icon';
import ChatDrawer from './ChatDrawer';

type State = 'closed' | 'minimized' | 'open';

export default function ChatWidget() {
  const [state, setState] = useState<State>('closed');

  return (
    <>
      {/* Open drawer */}
      {state === 'open' && (
        <ChatDrawer
          onMinimize={() => setState('minimized')}
          onClose={() => setState('closed')}
        />
      )}

      {/* Minimized bar */}
      {state === 'minimized' && (
        <button
          onClick={() => setState('open')}
          className="fixed z-40 right-2 sm:right-4 bottom-2 sm:bottom-4
                     bg-[#5c1219] text-white px-3 py-2 shadow-2xl
                     flex items-center gap-2 hover:opacity-90 transition"
        >
          <Icon name="forum" size={16} />
          <span className="text-xs font-semibold">Chat</span>
        </button>
      )}

      {/* Closed: floating button */}
      {state === 'closed' && (
        <button
          onClick={() => setState('open')}
          className="fixed z-40 right-2 sm:right-4 bottom-16 sm:bottom-4
                     w-11 h-11 bg-[#5c1219] text-white shadow-2xl
                     flex items-center justify-center hover:opacity-90 transition"
          aria-label="Open chat"
          title="Chat"
        >
          <Icon name="forum" size={20} />
        </button>
      )}
    </>
  );
}