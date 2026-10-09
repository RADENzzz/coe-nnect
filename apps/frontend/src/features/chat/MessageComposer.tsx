import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/ui/Icon';

interface Props {
  onSend: (body: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function MessageComposer({
  onSend,
  disabled,
  placeholder = 'Type a message…',
}: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = 100;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
  }, [value]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue('');
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  return (
    <div className="border-t border-slate-200 px-3 py-2.5 shrink-0 bg-white">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={disabled}
          placeholder={placeholder}
          className="
            flex-1 resize-none
            bg-slate-50 border border-slate-200
            px-3 py-2 text-[13px] text-slate-900
            placeholder:text-slate-400
            focus:outline-none focus:border-[#5c1219] focus:bg-white
            transition-colors
            max-h-[100px] overflow-y-auto
            disabled:opacity-60 disabled:cursor-not-allowed
          "
          style={{ minHeight: 38 }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="
            w-9 h-9 bg-[#5c1219] text-white
            flex items-center justify-center
            hover:bg-[#6b1620] active:bg-[#4a0e14]
            transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#5c1219]
            shrink-0
          "
          aria-label="Send"
          title="Send (Enter)"
        >
          <Icon name="send" size={16} />
        </button>
      </div>
      <div className="flex items-center justify-between mt-1.5 px-1">
        <span className="text-[9px] text-slate-400">
          <kbd className="px-1 py-px border border-slate-300 bg-slate-50 font-mono text-[9px]">
            ⏎
          </kbd>{' '}
          to send ·{' '}
          <kbd className="px-1 py-px border border-slate-300 bg-slate-50 font-mono text-[9px]">
            ⇧⏎
          </kbd>{' '}
          for new line
        </span>
        {value.length > 0 && (
          <span className="text-[9px] text-slate-400 tabular-nums">
            {value.length}/2000
          </span>
        )}
      </div>
    </div>
  );
}