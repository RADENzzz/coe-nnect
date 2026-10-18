import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import clsx from 'clsx';
import Icon from './Icon';

export interface SearchableOption {
  value: string;
  label: string;
  /** Optional secondary text — e.g. dept code, employee ID */
  meta?: string;
  /** Optional group label — options with the same group are clustered */
  group?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  /** Optional label to render above the input (usually not needed; parent renders it) */
  ariaLabel?: string;
}

/**
 * Searchable dropdown — text input that filters a list of options as you type.
 *
 * Behavior:
 *   - Click to open; focus jumps into the search input
 *   - Type to filter (matches label + meta, case-insensitive)
 *   - Arrow up/down to highlight
 *   - Enter to select highlighted
 *   - Escape to close
 *   - Click outside to close
 *   - Clear (×) button when a value is selected
 *
 * z-index: dropdown uses z-[200] so it renders above Modal backdrops
 * (Modal uses z-[110]). Matches RowActionMenu popover z-[200].
 */
export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  emptyMessage = 'No options match',
  disabled = false,
  className,
  ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  // Filter by query
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const haystack = `${o.label} ${o.meta ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [options, query]);

  // Group options if any have `group`
  const grouped = useMemo(() => {
    const hasGroups = filtered.some((o) => !!o.group);
    if (!hasGroups) return null;
    const map = new Map<string, SearchableOption[]>();
    for (const o of filtered) {
      const key = o.group ?? 'Ungrouped';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return Array.from(map.entries());
  }, [filtered]);

  // Reset highlight when opening
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHighlighted(value || filtered[0]?.value || null);
    // Focus the input on the next tick (after popover renders)
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Outside click → close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Scroll highlighted into view
  useEffect(() => {
    if (!open || !highlighted || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-value="${highlighted}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, highlighted]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (filtered.length === 0) return;
        const idx = filtered.findIndex((o) => o.value === highlighted);
        const nextIdx =
          e.key === 'ArrowDown'
            ? (idx + 1) % filtered.length
            : (idx - 1 + filtered.length) % filtered.length;
        setHighlighted(filtered[nextIdx].value);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const pick = filtered.find((o) => o.value === highlighted);
        if (pick) {
          onChange(pick.value);
          setOpen(false);
        }
      }
    },
    [filtered, highlighted, onChange],
  );

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
  };

  return (
    <div ref={containerRef} className={clsx('relative', className)}>
      {!open && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          className={clsx(
            'w-full flex items-center justify-between gap-2',
            'bg-surface-container-low border border-surface-variant rounded-lg',
            'px-3 py-2.5 text-sm text-left',
            'focus:outline-none focus:border-primary',
            'disabled:opacity-60 disabled:cursor-not-allowed',
          )}
        >
          <span
            className={clsx(
              'truncate',
              !selectedOption && 'text-on-surface-variant',
            )}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {selectedOption && !disabled && (
              <span
                onClick={handleClear}
                role="button"
                tabIndex={-1}
                className="text-on-surface-variant hover:text-on-surface p-0.5"
                aria-label="Clear"
              >
                <Icon name="close" size={14} />
              </span>
            )}
            <Icon
              name="expand_more"
              size={18}
              className="text-on-surface-variant"
            />
          </span>
        </button>
      )}

      {open && (
        <div
          className={clsx(
            'absolute z-[200] left-0 right-0 top-0',
            'bg-surface-container-lowest border border-surface-variant rounded-lg shadow-lg',
            'flex flex-col max-h-72',
          )}
        >
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-variant">
            <Icon
              name="search"
              size={16}
              className="text-on-surface-variant shrink-0"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlighted(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type to search…"
              className="flex-1 bg-transparent border-0 outline-none text-sm text-on-surface placeholder:text-on-surface-variant"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-on-surface-variant hover:text-on-surface p-0.5"
              aria-label="Close"
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          {/* Options list */}
          <ul
            ref={listRef}
            role="listbox"
            className="flex-1 overflow-y-auto overscroll-contain py-1"
          >
            {filtered.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-on-surface-variant">
                {emptyMessage}
              </li>
            )}

            {grouped
              ? grouped.map(([group, opts]) => (
                  <li key={group}>
                    <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                      {group}
                    </div>
                    <ul>
                      {opts.map((o) => (
                        <OptionRow
                          key={o.value}
                          option={o}
                          isSelected={o.value === value}
                          isHighlighted={o.value === highlighted}
                          onHover={() => setHighlighted(o.value)}
                          onPick={() => {
                            onChange(o.value);
                            setOpen(false);
                          }}
                        />
                      ))}
                    </ul>
                  </li>
                ))
              : filtered.map((o) => (
                  <OptionRow
                    key={o.value}
                    option={o}
                    isSelected={o.value === value}
                    isHighlighted={o.value === highlighted}
                    onHover={() => setHighlighted(o.value)}
                    onPick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  />
                ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function OptionRow({
  option,
  isSelected,
  isHighlighted,
  onHover,
  onPick,
}: {
  option: SearchableOption;
  isSelected: boolean;
  isHighlighted: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  return (
    <li role="option" aria-selected={isSelected}>
      <button
        type="button"
        data-value={option.value}
        onClick={onPick}
        onMouseEnter={onHover}
        className={clsx(
          'w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2',
          isSelected
            ? 'bg-primary text-on-primary font-semibold'
            : isHighlighted
            ? 'bg-surface-container-low text-on-surface'
            : 'text-on-surface hover:bg-surface-container-low',
        )}
      >
        <span className="flex-1 min-w-0">
          <span className="block truncate">{option.label}</span>
          {option.meta && (
            <span
              className={clsx(
                'block text-[11px] truncate',
                isSelected
                  ? 'text-on-primary/70'
                  : 'text-on-surface-variant',
              )}
            >
              {option.meta}
            </span>
          )}
        </span>
        {isSelected && (
          <Icon name="check" size={14} className="shrink-0" />
        )}
      </button>
    </li>
  );
}