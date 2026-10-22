import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Icon from './Icon';
import { Bbcode } from '../../lib/bbcode';

const PLACEHOLDER =
  'Explain what is happening, what is affected, and when it should be back.\n\n' +
  'Formatting is supported — select text and use the toolbar:\n' +
  '[b]bold[/b], [i]italic[/i], [url=https://status.example.com]status page[/url], [list][*] item[/list]';

interface ToolMeta {
  id: string;
  icon: string;
  label: string;
  hint: string;
}

/** Inline tags wrap the selection (or a placeholder word). */
const INLINE_TOOLS: Array<
  ToolMeta & { open: string; close: string; sample: string }
> = [
  {
    id: 'bold',
    icon: 'format_bold',
    label: 'Bold',
    hint: 'Ctrl+B · [b]…[/b]',
    open: '[b]',
    close: '[/b]',
    sample: 'bold text',
  },
  {
    id: 'italic',
    icon: 'format_italic',
    label: 'Italic',
    hint: 'Ctrl+I · [i]…[/i]',
    open: '[i]',
    close: '[/i]',
    sample: 'italic text',
  },
  {
    id: 'underline',
    icon: 'format_underlined',
    label: 'Underline',
    hint: 'Ctrl+U · [u]…[/u]',
    open: '[u]',
    close: '[/u]',
    sample: 'underlined text',
  },
  {
    id: 'strike',
    icon: 'strikethrough_s',
    label: 'Strikethrough',
    hint: '[s]…[/s]',
    open: '[s]',
    close: '[/s]',
    sample: 'struck text',
  },
];

const BLOCK_TOOLS: Array<
  ToolMeta & { open: string; close: string; sample: string }
> = [
  {
    id: 'code',
    icon: 'code',
    label: 'Code',
    hint: '[code]…[/code]',
    open: '[code]',
    close: '[/code]',
    sample: 'npm run dev',
  },
  {
    id: 'quote',
    icon: 'format_quote',
    label: 'Quote',
    hint: '[quote]…[/quote]',
    open: '[quote]',
    close: '[/quote]',
    sample: 'Quoted note',
  },
  {
    id: 'center',
    icon: 'format_align_center',
    label: 'Center',
    hint: '[center]…[/center]',
    open: '[center]',
    close: '[/center]',
    sample: 'Centered line',
  },
];

interface BbcodeEditorProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  disabled?: boolean;
  label?: string;
}

/**
 * Message editor for the system status banner.
 *
 * - Large, resizable textarea with a BBCode toolbar and live preview
 * - Wraps the current selection, so formatting never loses the caret
 * - Renders with the same `Bbcode` component as the real popup, so the
 *   preview cannot drift from production
 */
export default function BbcodeEditor({
  id,
  value,
  onChange,
  maxLength,
  disabled,
  label,
}: BbcodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null);
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [limitNotice, setLimitNotice] = useState(false);

  // Restore the caret after React re-renders the controlled textarea.
  useEffect(() => {
    const el = textareaRef.current;
    const selection = pendingSelection.current;
    if (!el || !selection) return;
    pendingSelection.current = null;
    el.focus();
    el.setSelectionRange(selection[0], selection[1]);
  }, [value]);

  useEffect(() => {
    if (!limitNotice) return;
    const timer = setTimeout(() => setLimitNotice(false), 2200);
    return () => clearTimeout(timer);
  }, [limitNotice]);

  const tooLong = value.length > maxLength * 0.9;

  function commit(next: string, selectionStart: number, selectionEnd: number) {
    if (next.length > maxLength) {
      setLimitNotice(true);
      return;
    }
    pendingSelection.current = [selectionStart, selectionEnd];
    onChange(next);
  }

  function wrapSelection(open: string, close: string, sample: string) {
    if (disabled) return;
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    const selected = value.slice(start, end);
    const inner = selected || sample;
    const next =
      value.slice(0, start) + open + inner + close + value.slice(end);

    commit(next, start + open.length, start + open.length + inner.length);
  }

  function insertLink() {
    if (disabled) return;
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    const selected = value.slice(start, end).trim();
    const isUrl = /^https?:\/\/\S+$/i.test(selected);

    if (isUrl) {
      const inserted = `[url]${selected}[/url]`;
      commit(
        value.slice(0, start) + inserted + value.slice(end),
        start + 5,
        start + 5 + selected.length,
      );
      return;
    }

    const url = 'https://example.com';
    const text = selected || 'link text';
    const inserted = `[url=${url}]${text}[/url]`;
    commit(
      value.slice(0, start) + inserted + value.slice(end),
      start + 5,
      start + 5 + url.length,
    );
  }

  function insertList() {
    if (disabled) return;
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    const needsBreak = start > 0 && value[start - 1] !== '\n';
    const body = '[*] First item\n[*] Second item';
    const inserted = `${needsBreak ? '\n' : ''}[list]\n${body}\n[/list]`;
    const cursorStart = start + inserted.indexOf('First item');

    commit(
      value.slice(0, start) + inserted + value.slice(end),
      cursorStart,
      cursorStart + 'First item'.length,
    );
  }

  function insertRule() {
    if (disabled) return;
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    const needsBreak = start > 0 && value[start - 1] !== '\n';
    const inserted = `${needsBreak ? '\n' : ''}[hr]\n`;

    commit(
      value.slice(0, start) + inserted + value.slice(end),
      start + inserted.length,
      start + inserted.length,
    );
  }

  function handleTool(id: string) {
    switch (id) {
      case 'link':
        insertLink();
        break;
      case 'list':
        insertList();
        break;
      case 'hr':
        insertRule();
        break;
      default: {
        const tool = [...INLINE_TOOLS, ...BLOCK_TOOLS].find((t) => t.id === id);
        if (!tool) break;
        const block = BLOCK_TOOLS.some((t) => t.id === id);
        const open = block ? `${tool.open}\n` : tool.open;
        const close = block ? `\n${tool.close}` : tool.close;
        wrapSelection(open, close, tool.sample);
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const mod = event.ctrlKey || event.metaKey;
    if (!mod) return;

    const key = event.key.toLowerCase();
    if (key === 'b') {
      event.preventDefault();
      handleTool('bold');
    } else if (key === 'i') {
      event.preventDefault();
      handleTool('italic');
    } else if (key === 'u') {
      event.preventDefault();
      handleTool('underline');
    } else if (key === 'k') {
      event.preventDefault();
      handleTool('link');
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow focus-within:border-[#5c1219]/40 focus-within:shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-2 py-1.5">
        <div
          role="tablist"
          aria-label="Message editor mode"
          className="relative flex rounded-lg bg-slate-200/70 p-0.5"
        >
          {(['write', 'preview'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={mode === tab}
              onClick={() => setMode(tab)}
              className={`relative rounded-md px-3 py-1 text-[11px] font-semibold capitalize transition-all duration-200 ${
                mode === tab
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <span
          className={`pr-1 text-[11px] tabular-nums transition-colors ${
            tooLong ? 'font-semibold text-rose-600' : 'text-slate-400'
          }`}
        >
          {value.length.toLocaleString()}/{maxLength.toLocaleString()}
        </span>
      </div>

      {mode === 'write' ? (
        <div className="animate-fade-in">
          <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 px-2 py-1">
            {INLINE_TOOLS.map((tool) => (
              <ToolbarButton
                key={tool.id}
                tool={tool}
                disabled={disabled}
                onClick={() => handleTool(tool.id)}
              />
            ))}

            <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />

            <ToolbarButton
              tool={{
                id: 'link',
                icon: 'link',
                label: 'Link',
                hint: 'Ctrl+K · [url=…]…[/url]',
              }}
              disabled={disabled}
              onClick={() => handleTool('link')}
            />

            {BLOCK_TOOLS.map((tool) => (
              <ToolbarButton
                key={tool.id}
                tool={tool}
                disabled={disabled}
                onClick={() => handleTool(tool.id)}
              />
            ))}

            <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />

            <ToolbarButton
              tool={{
                id: 'list',
                icon: 'format_list_bulleted',
                label: 'Bullet list',
                hint: '[list][*] item[/list]',
              }}
              disabled={disabled}
              onClick={() => handleTool('list')}
            />
            <ToolbarButton
              tool={{
                id: 'hr',
                icon: 'horizontal_rule',
                label: 'Divider',
                hint: '[hr]',
              }}
              disabled={disabled}
              onClick={() => handleTool('hr')}
            />
          </div>

          <textarea
            id={id}
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={maxLength}
            rows={14}
            spellCheck
            disabled={disabled}
            placeholder={PLACEHOLDER}
            aria-label={label ?? 'Message'}
            className="block min-h-[320px] w-full resize-y bg-white px-3.5 py-3 font-mono text-[13px] leading-relaxed text-slate-800 outline-none placeholder:font-sans placeholder:text-slate-400 disabled:bg-slate-50"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-3 py-1.5">
            <p className="text-[10px] text-slate-500">
              BBCode: <code className="rounded bg-slate-200/70 px-1">[b]</code>{' '}
              <code className="rounded bg-slate-200/70 px-1">[i]</code>{' '}
              <code className="rounded bg-slate-200/70 px-1">[u]</code>{' '}
              <code className="rounded bg-slate-200/70 px-1">[url=…]</code>{' '}
              <code className="rounded bg-slate-200/70 px-1">[list]</code> — or
              just paste a link.
            </p>
            {limitNotice && (
              <p className="animate-fade-in text-[10px] font-semibold text-rose-600">
                Character limit reached — shorten the message a little.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="animate-fade-in">
          <div className="min-h-[320px] whitespace-pre-line px-4 py-3.5 text-sm leading-relaxed text-slate-700">
            {value.trim() ? (
              <Bbcode
                text={value}
                linkClassName="font-semibold text-[#5c1219] underline underline-offset-2 hover:opacity-80"
              />
            ) : (
              <p className="text-slate-400">
                Nothing to preview yet — switch to Write and add a message.
              </p>
            )}
          </div>
          <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-1.5">
            <p className="text-[10px] text-slate-500">
              This is exactly how the message renders in the status popup.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolbarButton({
  tool,
  disabled,
  onClick,
}: {
  tool: ToolMeta;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={tool.label}
      title={`${tool.label} — ${tool.hint}`}
      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-all duration-150 hover:bg-white hover:text-[#5c1219] hover:shadow-sm active:scale-90 disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon name={tool.icon} size={17} />
    </button>
  );
}
