import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import ChatDrawer from './ChatDrawer';
import { useConversations } from '../../hooks/use-chat-conversations';
import { useAuthStore } from '../../store/auth.store';

const LS_OPEN_STATE_KEY = 'coe-nnect:chat-open';

interface ChatContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  totalUnread: number;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatControl(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChatControl must be used inside <ChatProvider>');
  }
  return ctx;
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const profile = useAuthStore((s) => s.profile);

  const [open, setOpen] = useState<boolean>(() => {
    try {
      const saved = sessionStorage.getItem(LS_OPEN_STATE_KEY);
      return saved === 'open';
    } catch {
      return false;
    }
  });

  // Viewers and the dev account don't get chat.
  const isEligible =
    profile?.role !== 'viewer' && profile?.role !== 'administrator';

  const { data: conversations = [] } = useConversations(isEligible);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0),
    [conversations],
  );

  // Persist open state
  useEffect(() => {
    try {
      sessionStorage.setItem(LS_OPEN_STATE_KEY, open ? 'open' : 'closed');
    } catch {
      /* ignore */
    }
  }, [open]);

  // Escape to close when open (respecting modals on top)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        !document.querySelector('[role="dialog"][aria-modal="true"]')
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const ctxValue = useMemo<ChatContextValue>(
    () => ({
      open: isEligible && open,
      setOpen,
      totalUnread: isEligible ? totalUnread : 0,
    }),
    [open, totalUnread, isEligible],
  );

  return (
    <ChatContext.Provider value={ctxValue}>
      {children}
      {isEligible && open && <ChatDrawer onClose={() => setOpen(false)} />}
    </ChatContext.Provider>
  );
}

/**
 * Legacy export — kept for any code still importing ChatWidget directly.
 * It now just renders nothing (the drawer is managed by ChatProvider).
 * Safe to delete this export once nothing else references it.
 */
export default function ChatWidget() {
  return null;
}