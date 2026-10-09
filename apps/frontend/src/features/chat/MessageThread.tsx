import { useEffect, useRef } from 'react';
import type { LocalMessage } from './types';

interface Props {
  messages: LocalMessage[];
  selfUserId: string;
  otherName: string;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function MessageThread({
  messages,
  selfUserId,
  otherName,
}: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-10 px-6 text-center">
        <div className="w-12 h-12 bg-slate-100 flex items-center justify-center mb-3">
          <span className="material-symbols-outlined text-slate-400">
            chat_bubble_outline
          </span>
        </div>
        <p className="text-xs font-semibold text-slate-700">
          Start the conversation
        </p>
        <p className="text-[11px] text-slate-400 mt-1">
          Say hello to {otherName}.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
      {messages.map((m) => {
        const isSelf = m.senderId === selfUserId;
        return (
          <div
            key={m.id}
            className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-3 py-2 ${
                isSelf
                  ? 'bg-[#5c1219] text-white'
                  : 'bg-slate-100 text-slate-900'
              }`}
            >
              <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">
                {m.body}
              </p>
              <p
                className={`text-[9px] mt-1 ${
                  isSelf ? 'text-white/60' : 'text-slate-400'
                }`}
              >
                {fmtTime(m.createdAt)}
              </p>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}