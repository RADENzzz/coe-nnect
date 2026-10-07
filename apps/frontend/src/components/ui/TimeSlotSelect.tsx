import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import Icon from './Icon';
import { formatTime } from '../../features/timetable/utils/time.util';

interface Props {
  /** Currently selected time in "HH:MM" 24h format. */
  value: string;
  /** Fires with the new "HH:MM" 24h value. */
  onChange: (value: string) => void;
  /** Available options in "HH:MM" 24h format. */
  options: string[];
  /** Optional placeholder when value is empty. */
  placeholder?: string;
  disabled?: boolean;
  /** Optional label rendered to the left inside the button. */
  ariaLabel?: string;
  className?: string;
}

/**
 * Compact time picker. Renders a button that opens a fixed-height
 * scrollable popover of times formatted as "h:MM AM/PM".
 *
 * Values are always 24h "HH:MM" strings — only display is AM/PM.
 */
export default function TimeSlotSelect({
  value,
  onChange,
  options,
  placeholder = 'Select time…',
  disabled = false,
  ariaLabel,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(value || null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Close on outside click
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

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Scroll the selected option into view when opening
  useEffect(() => {
    if (!open || !listRef.current || !value) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-value="${value}"]`,
    );
    el?.scrollIntoView({ block: 'center' });
  }, [open, value]);

  const handlePick = (t: string) => {
    onChange(t);
    setOpen(false);
    setHighlighted(t);
  };

  return (
    <div ref={containerRef} className={clsx('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={clsx(
          'w-full flex items-center justify-between gap-2',
          'bg-surface-container-low border border-surface-variant rounded-lg',
          'px-3 py-2.5 text-sm text-left',
          'focus:outline-none focus:border-primary',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          open && 'border-primary',
        )}
      >
        <span className={clsx(!value && 'text-on-surface-variant')}>
          {value ? formatTime(value) : placeholder}
        </span>
        <Icon
          name="expand_more"
          size={18}
          className={clsx(
            'shrink-0 text-on-surface-variant transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          className={clsx(
            'absolute z-50 mt-1 w-full',
            'max-h-64 overflow-y-auto overscroll-contain',
            'bg-surface-container-lowest border border-surface-variant rounded-lg shadow-lg',
            'py-1',
          )}
        >
          {options.map((t) => {
            const isSelected = t === value;
            return (
              <li key={t} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  data-value={t}
                  onClick={() => handlePick(t)}
                  onMouseEnter={() => setHighlighted(t)}
                  className={clsx(
                    'w-full text-left px-3 py-2 text-sm transition-colors',
                    isSelected
                      ? 'bg-[#5c1219] text-white font-semibold'
                      : highlighted === t
                      ? 'bg-surface-container-low text-on-surface'
                      : 'text-on-surface hover:bg-surface-container-low',
                  )}
                >
                  {formatTime(t)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}