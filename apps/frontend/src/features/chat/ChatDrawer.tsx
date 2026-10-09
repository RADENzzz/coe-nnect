import { useMemo, useState, useEffect } from 'react';
import Icon from '../../components/ui/Icon';
import { useAuthStore } from '../../store/auth.store';
import { useOnlineUsers } from '../../hooks/use-online-users';
import OnlineUserList from './OnlineUserList';
import MessageThread from './MessageThread';
import MessageComposer from './MessageComposer';
import type { LocalMessage } from './types';

interface Props {
  onMinimize: () => void;
  onClose: () => void;
}

export default function ChatDrawer({ onMinimize, onClose }: Props) {
  const profile = useAuthStore((s) => s.profile);
  const { onlineUsers } = useOnlineUsers();

  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, LocalMessage[]>>({});

  const others = useMemo(() => {
    if (!profile) return [];
    const roleOrder: Record<string, number> = {
      administrator: 0,
      college_dean: 1,
      department_head: 2,
      viewer: 3,
    };
    return onlineUsers
      .filter((u) => u.user_id !== profile.user_id)
      .sort((a, b) => {
        const r = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
        if (r !== 0) return r;
        return a.username.localeCompare(b.username);
      });
  }, [onlineUsers, profile]);

  useEffect(() => {
    if (!activeUserId && others.length > 0) {
      setActiveUserId(others[0].user_id);
    }
  }, [others, activeUserId]);

  const activeUser = others.find((u) => u.user_id === activeUserId) ?? null;
  const messages = activeUserId ? threads[activeUserId] ?? [] : [];

  const handleSend = (body: string) => {
    if (!activeUserId || !profile) return;
    const msg: LocalMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      senderId: profile.user_id,
      senderName: profile.username,
      body,
      createdAt: new Date().toISOString(),
    };
    setThreads((prev) => ({
      ...prev,
      [activeUserId]: [...(prev[activeUserId] ?? []), msg],
    }));
  };

  return (
    <div
      className="fixed z-40 bg-white border border-slate-200 shadow-2xl flex flex-col
                 right-2 sm:right-4
                 bottom-2 sm:bottom-4
                 w-[calc(100vw-1rem)] sm:w-[400px]
                 h-[70vh] sm:h-[520px]
                 max-h-[calc(100vh-1rem)]"
    >
      {/* Header */}
      <div className="bg-[#5c1219] text-white px-3 py-2 flex items-center gap-2 shrink-0">
        <Icon name="forum" size={18} />
        <h3 className="text-xs font-bold flex-1">Chat</h3>
        <span className="text-[10px] opacity-70 mr-1">
          {others.length} online
        </span>
        <button
          onClick={onMinimize}
          className="w-6 h-6 flex items-center justify-center hover:bg-white/10"
          aria-label="Minimize"
          title="Minimize"
        >
          <Icon name="remove" size={16} />
        </button>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center hover:bg-white/10"
          aria-label="Close"
          title="Close"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left: online users */}
        <div className="w-[140px] sm:w-[160px] border-r border-slate-100 overflow-y-auto shrink-0 bg-slate-50/50">
          <p className="px-3 pt-3 pb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
            Online
          </p>
          <OnlineUserList
            users={others}
            activeUserId={activeUserId}
            onPick={setActiveUserId}
          />
        </div>

        {/* Right: thread */}
        <div className="flex-1 flex flex-col min-w-0">
          {activeUser ? (
            <>
              <div className="px-3 py-2 border-b border-slate-100 shrink-0">
                <p className="text-xs font-semibold text-slate-900 truncate">
                  {activeUser.username}
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  {activeUser.dept_name
                    ? `[${activeUser.dept_code ?? '—'}] ${activeUser.dept_name}`
                    : 'College of Engineering'}
                </p>
              </div>
              <MessageThread
                messages={messages}
                selfUserId={profile?.user_id ?? ''}
                otherName={activeUser.username}
              />
              <MessageComposer onSend={handleSend} />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <Icon name="chat_bubble_outline" className="text-slate-300" size={32} />
              <p className="text-xs text-slate-500 mt-2">
                Pick someone online to start chatting.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}