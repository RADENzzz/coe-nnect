import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/ui/Icon';
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

// Linkify URLs in message text
function renderMessageBody(body: string): React.ReactNode {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = body.split(urlRegex);
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function MessageThread({
  messages,
  selfUserId,
  otherName,
  isLoading,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showJumpButton, setShowJumpButton] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Auto-scroll only if user is already at bottom
  useEffect(() => {
    if (isAtBottom) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    } else if (messages.length > 0) {
      setShowJumpButton(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setIsAtBottom(atBottom);
    if (atBottom) setShowJumpButton(false);
  };

  const jumpToLatest = () => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    setShowJumpButton(false);
  };

  const copyMessage = async (id: string, body: string) => {
    try {
      await navigator.clipboard.writeText(body);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      /* ignore */
    }
  };

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
        <div className="w-6 h-6 border-2 border-slate-300 border-t-[#5c1219] animate-spin rounded-full" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-10 px-6 text-center">
        <div className="w-16 h-16 bg-slate-50 border border-slate-200 flex items-center justify-center mb-4 rounded-full">
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
    <div className="flex-1 relative min-h-0">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50/30"
      >
        {grouped.map((group) => (
          <div key={group.day} className="space-y-3">
            {group.label && (
              <div className="flex items-center gap-3 py-1 sticky top-0 bg-slate-50/30 backdrop-blur-sm z-10 -mx-4 px-4">
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
              const isCopied = copiedId === m.messageId;

              return (
                <div
                  key={m.messageId}
                  className={`flex ${isSelf ? 'justify-end' : 'justify-start'} group`}
                >
                  <div className="relative max-w-[80%]">
                    <div
                      title={fullTime || undefined}
                      className={`px-3.5 py-2 transition-colors rounded-2xl ${
                        isSelf
                          ? 'bg-[#5c1219] text-white rounded-br-sm'
                          : 'bg-white text-slate-900 border border-slate-200 rounded-bl-sm'
                      }`}
                    >
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                        {renderMessageBody(m.body)}
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

                    {/* Copy button on hover */}
                    <button
                      type="button"
                      onClick={() => copyMessage(m.messageId, m.body)}
                      className={`absolute top-1 ${
                        isSelf ? 'left-0 -translate-x-full pr-1' : 'right-0 translate-x-full pl-1'
                      } opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-slate-700`}
                      title="Copy message"
                      aria-label="Copy message"
                    >
                      <Icon name={isCopied ? 'check' : 'content_copy'} size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Jump to latest */}
      {showJumpButton && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-4 right-4 px-3 py-1.5 bg-[#5c1219] text-white text-xs font-semibold rounded-full shadow-lg hover:bg-[#6b1620] transition flex items-center gap-1.5 animate-fade-in"
        >
          <Icon name="arrow_downward" size={14} />
          Latest
        </button>
      )}
    </div>
  );
}