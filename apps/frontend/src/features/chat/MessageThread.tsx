import { useEffect, useMemo, useRef } from 'react';
import type { ChatMessage } from './types';

interface Props {
  messages: ChatMessage[];
  selfUserId: string;
  otherName: string;
  isLoading?: boolean;
}

function safeDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function fmtTime(iso: string | null | undefined): string {
  const d = safeDate(iso);
  if (!d) return '';
  return d.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function fmtFullTime(iso: string | null | undefined): string {
  const d = safeDate(iso);
  if (!d) return '';
  return d.toLocaleString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function dayKey(iso: string | null | undefined): string {
  const d = safeDate(iso);
  if (!d) return 'unknown';
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string | null | undefined): string {
  const d = safeDate(iso);
  if (!d) return '';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (dayKey(iso) === dayKey(today.toISOString())) return 'Today';
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return 'Yesterday';
  return d.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
}

export default function MessageThread({
  messages,
  selfUserId,
  otherName,
  isLoading,
}: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const grouped = useMemo(() => {
    const groups: { day: string; label: string; items: ChatMessage[] }[] = [];
    for (const m of messages) {
      const key = dayKey(m.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.day === key) {
        last.items.push(m);
      } else {
        groups.push({
          day: key,
          label: dayLabel(m.createdAt) || 'Earlier',
          items: [m],
        });
      }
    }
    return groups;
  }, [messages]);

  if (isLoading && messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-[#5c1219] animate-spin" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-10 px-6 text-center">
        <div className="w-16 h-16 bg-slate-50 border border-slate-200 flex items-center justify-center mb-4">
          <span
            className="material-symbols-outlined text-slate-300"
            style={{ fontSize: 32 }}
          >
            waving_hand
          </span>
        </div>
        <p className="text-sm font-semibold text-slate-800">
          Start the conversation
        </p>
        <p className="text-xs text-slate-500 mt-1 max-w-[200px] leading-snug">
          Say hello to <strong>{otherName}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50/30">
      {grouped.map((group) => (
        <div key={group.day} className="space-y-3">
          {group.label && (
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {group.label}
              </span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
          )}

          {group.items.map((m, idx) => {
            const isSelf = m.senderId === selfUserId;
            const prev = group.items[idx - 1];
            const isFirstInGroup = !prev || prev.senderId !== m.senderId;
            const time = fmtTime(m.createdAt);
            const fullTime = fmtFullTime(m.createdAt);

            return (
              <div
                key={m.messageId}
                className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  title={fullTime || undefined}
                  className={`group max-w-[80%] px-3.5 py-2 transition-colors ${
                    isSelf
                      ? 'bg-[#5c1219] text-white'
                      : 'bg-white text-slate-900 border border-slate-200'
                  }`}
                >
                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                    {m.body}
                  </p>
                  {time && (
                    <p
                      className={`text-[9px] mt-1 tabular-nums transition-opacity duration-150 ${
                        isSelf ? 'text-white/70' : 'text-slate-400'
                      } ${
                        isFirstInGroup
                          ? 'opacity-100'
                          : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      {time}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}