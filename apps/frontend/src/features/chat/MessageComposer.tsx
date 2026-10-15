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
  placeholder = 'Type a message…',
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
    <div className="border-t border-slate-200 px-3 py-2.5 shrink-0 bg-white">
      <div className="flex items-end gap-2">
        {/* Emoji button */}
        <div ref={emojiRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowEmoji((v) => !v)}
            disabled={disabled}
            className="w-9 h-9 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]/30 disabled:opacity-40"
            aria-label="Insert emoji"
            title="Emoji"
          >
            <Icon name="sentiment_satisfied" size={18} />
          </button>
          {showEmoji && (
            <div className="absolute bottom-full left-0 mb-1 bg-white border border-slate-200 shadow-lg rounded-lg p-2 grid grid-cols-8 gap-0.5 w-[280px] z-10 animate-fade-in">
              {EMOJI_PALETTE.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    insertEmoji(e);
                    setShowEmoji(false);
                  }}
                  className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded text-lg"
                >
                  {e}
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
            flex-1 resize-none
            bg-slate-50 border border-slate-200
            px-3 py-2 text-[13px] text-slate-900
            placeholder:text-slate-400
            focus:outline-none focus:border-[#5c1219] focus:bg-white
            transition-colors
            max-h-[120px] overflow-y-auto
            disabled:opacity-60 disabled:cursor-not-allowed
            rounded
          "
          style={{ minHeight: 38 }}
        />

        {/* Send button */}
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim() || overLimit}
          className="
            w-9 h-9 bg-[#5c1219] text-white
            flex items-center justify-center
            hover:bg-[#6b1620] active:bg-[#4a0e14]
            transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#5c1219]
            shrink-0
            rounded
            focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219] focus-visible:ring-offset-1
          "
          aria-label="Send"
          title="Send (Enter)"
        >
          <Icon name="send" size={16} />
        </button>
      </div>

      <div className="flex items-center justify-between mt-1.5 px-1">
        <span className="text-[9px] text-slate-400">
          <kbd className="px-1 py-px border border-slate-300 bg-slate-50 font-mono text-[9px] rounded">
            ⏎
          </kbd>{' '}
          to send ·{' '}
          <kbd className="px-1 py-px border border-slate-300 bg-slate-50 font-mono text-[9px] rounded">
            ⇧⏎
          </kbd>{' '}
          for new line
        </span>
        {value.length > 0 && (
          <span
            className={`text-[9px] tabular-nums ${
              overLimit
                ? 'text-red-600 font-bold'
                : nearLimit
                ? 'text-amber-600'
                : 'text-slate-400'
            }`}
          >
            {value.length}/{MAX_CHARS}
          </span>
        )}
      </div>
    </div>
  );
}