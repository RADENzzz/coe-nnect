import { useMemo } from 'react';
import Icon from '../../../components/ui/Icon';
import type { ScheduleEntry } from '../types';

interface SubjectChip {
  subjectId: string;
  subjectCode: string;
  color: string;
}

/** How many subject chips to show before collapsing into "+N more". */
const MAX_SUBJECT_CHIPS = 10;

/**
 * Legend for the timetable grid (PM demo feedback, Oct 2026).
 *
 * Encodes the same visual language the blocks use:
 *   - background color = subject
 *   - diagonal white stripes = laboratory session
 *   - solid color = lecture session
 *
 * The striped swatch replicates ClassBlock's lab overlay (45°, 6px white
 * bands) over a fixed neutral base so the pattern reads the same as real
 * lab blocks next to the grid. A literal color is used because the slate
 * Tailwind tokens are inverted in dark mode.
 */
export default function TimetableLegend({
  entries,
}: {
  entries: ScheduleEntry[];
}) {
  const { subjects, hiddenCount } = useMemo(() => {
    const byId = new Map<string, SubjectChip>();
    for (const e of entries) {
      if (!byId.has(e.subjectId)) {
        byId.set(e.subjectId, {
          subjectId: e.subjectId,
          subjectCode: e.subjectCode,
          color: e.color,
        });
      }
    }
    const all = Array.from(byId.values());
    return {
      subjects: all.slice(0, MAX_SUBJECT_CHIPS),
      hiddenCount: Math.max(0, all.length - MAX_SUBJECT_CHIPS),
    };
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <div
      className="mb-2 px-4 py-2 rounded-xl border border-surface-variant bg-surface-container-lowest flex flex-wrap items-center gap-x-4 gap-y-1.5"
      data-tour="tt-legend"
    >
      {/* Subject colors */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 min-w-0">
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant shrink-0">
          <Icon name="palette" size={13} />
          Color = Subject
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {subjects.map((s) => (
            <span
              key={s.subjectId}
              className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-on-surface-variant whitespace-nowrap"
            >
              <span
                aria-hidden
                className="w-3.5 h-3.5 rounded-sm shrink-0"
                style={{ backgroundColor: s.color }}
              />
              {s.subjectCode}
            </span>
          ))}
          {hiddenCount > 0 && (
            <span className="text-[10px] text-on-surface-variant italic">
              +{hiddenCount} more
            </span>
          )}
        </div>
      </div>

      {/* Lecture vs laboratory pattern */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 ml-auto shrink-0">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-on-surface-variant">
          <span
            aria-hidden
            className="w-4 h-3.5 rounded-sm shrink-0"
            style={{ backgroundColor: '#64748b' }}
          />
          Solid = Lecture
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-on-surface-variant">
          <span
            aria-hidden
            className="w-4 h-3.5 rounded-sm shrink-0"
            style={{
              backgroundColor: '#64748b',
              backgroundImage:
                'repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(255,255,255,0.15) 6px, rgba(255,255,255,0.15) 12px)',
            }}
          />
          Striped = Laboratory
        </span>
      </div>
    </div>
  );
}
