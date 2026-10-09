import { useState } from 'react';
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

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue('');
  };

  return (
    <div className="border-t border-slate-100 px-3 py-2 flex items-end gap-2 shrink-0">
      <textarea
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
        className="flex-1 resize-none bg-slate-50 border border-slate-200 px-2.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#5c1219] max-h-24"
        style={{ minHeight: 36 }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !value.trim()}
        className="w-9 h-9 bg-[#5c1219] text-white flex items-center justify-center hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        aria-label="Send"
      >
        <Icon name="send" size={16} />
      </button>
    </div>
  );
}