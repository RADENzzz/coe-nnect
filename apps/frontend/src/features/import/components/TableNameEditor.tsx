import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import type { ProspectusPdfTable } from '../types';

interface TableNameEditorProps {
  table: ProspectusPdfTable;
  disabled?: boolean;
  /** Nearest all-caps group heading inside/above the table region. */
  suggestedName: string | null;
  onChange: (label: string | null) => void;
}

/**
 * Elective table name editor.
 *
 * Elective pools print a group heading such as "SOFTWARE DEVELOPMENT" above
 * their rows. That heading becomes the table's top name, so the chip on the
 * canvas and the import list can show which elective group a table holds
 * instead of only "Elective · any year / term".
 */
export default function TableNameEditor({
  table,
  disabled = false,
  suggestedName,
  onChange,
}: TableNameEditorProps) {
  const stored = table.label ?? '';
  const [draft, setDraft] = useState(stored);
  const lastEmittedRef = useRef<string | null>(stored);

  // Keep the input in sync when the label changes from outside (Cancel
  // restoring the saved table, for example). Changes typed here update
  // `lastEmittedRef` first so they do not get overwritten mid-keystroke.
  useEffect(() => {
    const incoming = table.label ?? '';
    if (incoming !== lastEmittedRef.current) {
      lastEmittedRef.current = incoming;
      setDraft(incoming);
    }
  }, [table.label]);

  const emit = (value: string) => {
    setDraft(value);
    const next = value.trim() ? value : null;
    if (next !== lastEmittedRef.current) {
      lastEmittedRef.current = next;
      onChange(next);
    }
  };

  const trimmed = draft.trim();
  const canUseHeading =
    !disabled && !!suggestedName && trimmed !== suggestedName;

  return (
    <div className="rounded-lg border border-surface-variant bg-surface-container-lowest p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-on-surface">
            Table name
          </div>
          <p className="text-[10px] text-on-surface-variant">
            Shown above the table and in the import list.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (suggestedName) emit(suggestedName);
          }}
          disabled={!canUseHeading}
          className="shrink-0 inline-flex items-center gap-1 rounded-md border border-surface-variant bg-white px-2 py-1 text-[10px] font-semibold text-on-surface hover:bg-surface-container-low transition disabled:opacity-40"
          title={
            suggestedName
              ? `Use the PDF heading "${suggestedName}"`
              : 'No all-caps group heading was found inside the region'
          }
        >
          <Icon name="title" size={12} />
          Use heading
        </button>
      </div>

      <input
        type="text"
        value={draft}
        onChange={(e) => emit(e.target.value)}
        disabled={disabled}
        maxLength={200}
        placeholder="e.g. SOFTWARE DEVELOPMENT"
        className="w-full rounded-md border border-surface-variant bg-white px-2.5 py-1.5 text-xs font-semibold text-on-surface focus:border-primary focus:outline-none disabled:opacity-50"
        aria-label="Elective table name"
      />

      {suggestedName ? (
        <p className="mt-1 text-[10px] text-on-surface-variant">
          Heading in PDF:{' '}
          <span className="font-semibold text-on-surface">{suggestedName}</span>
        </p>
      ) : (
        <p className="mt-1 text-[10px] italic text-on-surface-variant">
          No all-caps group heading was found inside the region. Type the group
          name shown in the PDF.
        </p>
      )}
    </div>
  );
}
