import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/ui/Icon';
import type { ChatMessage } from './types';

interface Props {
  messages: ChatMessage[];
  selfUserId: string;
  otherName: string;
  isLoading?: boolean;
}

function initials(name: string): string {
  if (!name) return '—';
  return name.slice(0, 2).toUpperCase();
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

// Linkify URLs in message text. Test with a fresh non-global regex so a
// stateful `lastIndex` from the split pass cannot skip a link.
function renderMessageBody(body: string): React.ReactNode {
  const parts = body.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all underline hover:no-underline"
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
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
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
      <div className="flex flex-1 items-center justify-center bg-surface-container-lowest">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-surface-container-lowest px-6 py-10 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-container text-on-surface-variant/70">
          <Icon name="waving_hand" size={26} />
        </div>
        <p className="text-sm font-semibold text-on-surface">
          Start the conversation
        </p>
        <p className="mt-1 max-w-[220px] text-xs leading-snug text-on-surface-variant">
          Say hello to <strong>{otherName}</strong>. Messages are private to
          the two of you.
        </p>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="absolute inset-0 space-y-3 overflow-y-auto bg-surface-container-lowest px-3 py-4 sm:px-4"
      >
        {grouped.map((group) => (
          <div key={group.day} className="space-y-2">
            {group.label && (
              <div className="sticky top-0 z-10 -mx-3 flex items-center gap-3 bg-surface-container-lowest/95 px-3 py-1.5 backdrop-blur sm:-mx-4 sm:px-4">
                <div className="h-px flex-1 bg-outline-variant" />
                <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
                  {group.label}
                </span>
                <div className="h-px flex-1 bg-outline-variant" />
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
                  className={`group flex items-end gap-2 ${
                    isSelf ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {!isSelf &&
                    (isFirstInGroup ? (
                      <span
                        className="mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-[8px] font-bold text-on-surface-variant"
                        aria-hidden="true"
                      >
                        {initials(otherName)}
                      </span>
                    ) : (
                      <span className="w-6 shrink-0" aria-hidden="true" />
                    ))}

                  <div className="relative max-w-[78%]">
                    <div
                      title={fullTime || undefined}
                      className={`px-3.5 py-2 ${
                        isSelf
                          ? 'rounded-[18px] rounded-br-[4px] bg-primary text-on-primary'
                          : 'rounded-[18px] rounded-bl-[4px] border border-outline-variant bg-surface text-on-surface'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
                        {renderMessageBody(m.body)}
                      </p>
                      {time && (
                        <p
                          className={`mt-1 text-[9px] tabular-nums transition-opacity duration-150 ${
                            isSelf
                              ? 'text-on-primary/70'
                              : 'text-on-surface-variant'
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
                        isSelf
                          ? 'left-0 -translate-x-full pr-1'
                          : 'right-0 translate-x-full pl-1'
                      } p-1 text-on-surface-variant/60 opacity-0 transition-opacity hover:text-on-surface group-hover:opacity-100`}
                      title="Copy message"
                      aria-label="Copy message"
                    >
                      <Icon
                        name={isCopied ? 'check' : 'content_copy'}
                        size={12}
                      />
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
          className="absolute bottom-4 right-4 flex animate-fade-in items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary shadow-lg transition hover:bg-primary-container"
        >
          <Icon name="arrow_downward" size={14} />
          Latest
        </button>
      )}
    </div>
  );
}
