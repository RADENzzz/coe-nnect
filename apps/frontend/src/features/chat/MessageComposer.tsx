import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/ui/Icon';

interface Props {
  onSend: (body: string) => void;
  disabled?: boolean;
  placeholder?: string;
  conversationId?: string;
}

const MAX_CHARS = 2000;
const LS_DRAFT_PREFIX = 'coe-nnect:chat-draft:';

const EMOJI_PALETTE = [
  '👍', '🙏', '🎉', '😊', '😂', '😅', '😍', '🤔',
  '😴', '😎', '🙌', '👋', '❤️', '🔥', '✨', '💯',
  '✅', '❌', '⚠️', '📌', '📎', '📅', '🕐', '☕',
];

export default function MessageComposer({
  onSend,
  disabled,
  placeholder = 'Write a message…',
  conversationId,
}: Props) {
  const [value, setValue] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  // Auto-resize
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = 120;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
  }, [value]);

  // Load draft when conversation changes
  useEffect(() => {
    if (!conversationId) return;
    try {
      const draft = localStorage.getItem(LS_DRAFT_PREFIX + conversationId);
      setValue(draft ?? '');
    } catch {
      setValue('');
    }
  }, [conversationId]);

  // Persist draft as you type
  useEffect(() => {
    if (!conversationId) return;
    try {
      if (value.trim()) {
        localStorage.setItem(LS_DRAFT_PREFIX + conversationId, value);
      } else {
        localStorage.removeItem(LS_DRAFT_PREFIX + conversationId);
      }
    } catch {
      /* ignore */
    }
  }, [value, conversationId]);

  // Close emoji on outside click
  useEffect(() => {
    if (!showEmoji) return;
    const onDown = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmoji(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showEmoji]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    try {
      if (conversationId) {
        localStorage.removeItem(LS_DRAFT_PREFIX + conversationId);
      }
    } catch {
      /* ignore */
    }
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) {
      setValue((v) => v + emoji);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const overLimit = value.length > MAX_CHARS;
  const nearLimit = value.length > MAX_CHARS * 0.9;

  return (
    <div className="shrink-0 border-t border-outline-variant bg-surface px-3 py-2.5">
      <div className="flex items-end gap-2">
        {/* Emoji button */}
        <div ref={emojiRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowEmoji((v) => !v)}
            disabled={disabled}
            className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-40"
            aria-label="Insert emoji"
            title="Emoji"
          >
            <Icon name="sentiment_satisfied" size={18} />
          </button>
          {showEmoji && (
            <div className="absolute bottom-full left-0 z-10 mb-1 grid w-[280px] animate-fade-in grid-cols-8 gap-0.5 rounded-[12px] border border-outline-variant bg-surface p-2 shadow-lg">
              {EMOJI_PALETTE.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    insertEmoji(emoji);
                    setShowEmoji(false);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-lg hover:bg-surface-container-low"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              submit();
            } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={disabled}
          placeholder={placeholder}
          maxLength={MAX_CHARS + 200}
          className="
            max-h-[120px] flex-1 resize-none overflow-y-auto
            rounded-[18px] border border-outline-variant bg-surface-container-low
            px-3.5 py-2 text-[13px] text-on-surface
            placeholder:text-on-surface-variant/70
            transition-colors focus:border-primary focus:bg-surface focus:outline-none
            disabled:cursor-not-allowed disabled:opacity-60
          "
          style={{ minHeight: 38 }}
        />

        {/* Send button */}
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim() || overLimit}
          className="
            flex h-9 w-9 shrink-0 items-center justify-center rounded-full
            bg-primary text-on-primary transition-colors
            hover:bg-primary-container active:bg-primary-container
            disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-primary
            focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1
          "
          aria-label="Send"
          title="Send (Enter)"
        >
          <Icon name="send" size={16} />
        </button>
      </div>

      <div className="mt-1.5 flex items-center justify-between px-1">
        <span className="hidden text-[9px] text-on-surface-variant/70 sm:block">
          <kbd className="rounded border border-outline-variant bg-surface-container-low px-1 py-px font-mono text-[9px]">
            ⏎
          </kbd>{' '}
          to send ·{' '}
          <kbd className="rounded border border-outline-variant bg-surface-container-low px-1 py-px font-mono text-[9px]">
            ⇧⏎
          </kbd>{' '}
          for new line
        </span>
        {value.length > 0 && (
          <span
            className={`ml-auto text-[9px] tabular-nums ${
              overLimit
                ? 'font-bold text-error'
                : nearLimit
                  ? 'text-amber-600'
                  : 'text-on-surface-variant/70'
            }`}
          >
            {value.length}/{MAX_CHARS}
          </span>
        )}
      </div>
    </div>
  );
}
