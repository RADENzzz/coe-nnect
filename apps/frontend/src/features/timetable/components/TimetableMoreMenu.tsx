import { useEffect, useRef, useState } from 'react';
import Icon from '../../../components/ui/Icon';

export interface TimetableMoreMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  title?: string;
  dataTour?: string;
}

/** Compact overflow menu for secondary timetable header actions. */
export default function TimetableMoreMenu({
  items,
}: {
  items: TimetableMoreMenuItem[];
}): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'timetable-more-menu' : undefined}
        title="More actions"
        className="flex items-center gap-1.5 px-3 py-2 border border-surface-variant text-sm font-semibold text-on-surface hover:bg-surface-container-low transition rounded-lg"
      >
        <span>More</span>
        <Icon name="expand_more" size={14} />
      </button>
      {open && (
        <div
          id="timetable-more-menu"
          role="menu"
          aria-label="More actions"
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-surface-variant bg-surface py-1 shadow-xl"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              title={item.title}
              data-tour={item.dataTour}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="block w-full px-4 py-2.5 text-left text-sm font-medium text-on-surface hover:bg-surface-container transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
