import Icon from '@/components/ui/Icon';
import type {
  ColumnRole,
  ColumnSlice,
  ProspectusPdfTable,
} from '../types';
import { COLUMN_LABELS, COLUMN_ORDER } from '../types';

type ElectiveLayout = 'lec-lab-total' | 'lec-lab' | 'lec' | 'lab' | 'total';

interface LayoutOption {
  key: ElectiveLayout;
  label: string;
  hint: string;
  roles: ColumnRole[];
}

const LAYOUTS: LayoutOption[] = [
  {
    key: 'lec-lab-total',
    label: 'Lec + Lab + Total',
    hint: 'Separate lecture, laboratory, and total columns',
    roles: ['lec', 'lab', 'total'],
  },
  {
    key: 'lec-lab',
    label: 'Lec + Lab',
    hint: 'No total column; total is derived from lec + lab',
    roles: ['lec', 'lab'],
  },
  {
    key: 'lec',
    label: 'Lecture only',
    hint: 'All units are lecture units',
    roles: ['lec'],
  },
  {
    key: 'lab',
    label: 'Laboratory only',
    hint: 'All units are laboratory units',
    roles: ['lab'],
  },
  {
    key: 'total',
    label: 'Total only',
    hint: 'One "No. Units" column',
    roles: ['total'],
  },
];

const LAYOUT_WEIGHTS: Record<
  ElectiveLayout,
  Partial<Record<ColumnRole, number>>
> = {
  'lec-lab-total': {
    code: 0.15,
    title: 0.45,
    lec: 0.13,
    lab: 0.13,
    total: 0.14,
  },
  'lec-lab': { code: 0.16, title: 0.52, lec: 0.16, lab: 0.16 },
  lec: { code: 0.15, title: 0.65, lec: 0.2 },
  lab: { code: 0.15, title: 0.65, lab: 0.2 },
  total: { code: 0.18, title: 0.52, total: 0.3 },
};

interface ElectiveColumnsEditorProps {
  table: ProspectusPdfTable;
  disabled?: boolean;
  onChange: (columns: ColumnSlice[]) => void;
  /** Re-read the header inside the table region and replace the slices. */
  onDetect: () => void;
}

function layoutForRoles(roles: Set<ColumnRole>): ElectiveLayout | null {
  if (roles.has('lec') && roles.has('lab') && roles.has('total')) {
    return 'lec-lab-total';
  }
  if (roles.has('lec') && roles.has('lab')) return 'lec-lab';
  if (roles.has('lec')) return 'lec';
  if (roles.has('lab')) return 'lab';
  if (roles.has('total')) return 'total';
  return null;
}

/**
 * Build a complete column layout for an elective table.
 *
 * Electives are not fixed to the six-column curriculum contract: a table can
 * have only lecture units, only laboratory units, a lec/lab/total split, or a
 * single total. Some also omit the prerequisite column, so that column is
 * opt-in.
 */
export function buildElectiveColumns(
  table: ProspectusPdfTable,
  layout: ElectiveLayout,
  includePrereq: boolean,
): ColumnSlice[] {
  const xStart = Number(table.regionXStartPt);
  const xEnd = Number(table.regionXEndPt);
  const width = Math.max(1, xEnd - xStart);

  const roles: ColumnRole[] = ['code', 'title'];
  if (includePrereq) roles.push('prereq');
  roles.push(...LAYOUTS.find((option) => option.key === layout)!.roles);

  const weights: Partial<Record<ColumnRole, number>> = {
    ...LAYOUT_WEIGHTS[layout],
  };
  if (includePrereq) {
    weights.prereq = 0.15;
    weights.title = Math.max(0.1, (weights.title ?? 0) - 0.15);
  }

  const weightTotal = roles.reduce(
    (sum, role) => sum + (weights[role] ?? 0),
    0,
  );
  const scale = weightTotal > 0 ? 1 / weightTotal : 1;

  let cursor = xStart;
  return roles.map((role) => {
    const sliceWidth = width * (weights[role] ?? 0) * scale;
    const slice: ColumnSlice = {
      role,
      x_start_pt: cursor,
      x_end_pt: cursor + sliceWidth,
    };
    cursor += sliceWidth;
    return slice;
  });
}

/**
 * Elective-only column controls. Regular tables keep the fixed six-column
 * curriculum layout, so this panel is hidden for them.
 */
export default function ElectiveColumnsEditor({
  table,
  disabled = false,
  onChange,
  onDetect,
}: ElectiveColumnsEditorProps) {
  const roles = new Set(table.columns.map((column) => column.role));
  const currentLayout = layoutForRoles(roles);
  const hasPrereq = roles.has('prereq');
  const visibleRoles = COLUMN_ORDER.filter((role) => roles.has(role));

  const apply = (layout: ElectiveLayout, includePrereq = hasPrereq) => {
    onChange(buildElectiveColumns(table, layout, includePrereq));
  };

  return (
    <div className="rounded-lg border border-surface-variant bg-surface-container-lowest p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-on-surface">
            Elective column layout
          </div>
          <p className="text-[10px] text-on-surface-variant">
            Pick the columns this PDF actually prints. Prerequisites are
            optional.
          </p>
        </div>
        <button
          type="button"
          onClick={onDetect}
          disabled={disabled}
          className="shrink-0 inline-flex items-center gap-1 rounded-md border border-surface-variant bg-white px-2 py-1 text-[10px] font-semibold text-on-surface hover:bg-surface-container-low transition disabled:opacity-50"
          title="Read the header inside the table region again"
        >
          <Icon name="auto_awesome" size={12} />
          Re-read PDF
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1">
        {LAYOUTS.map((option) => {
          const active = currentLayout === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => apply(option.key)}
              disabled={disabled}
              title={option.hint}
              className={`rounded-md border px-2 py-1.5 text-left text-[10px] font-semibold transition disabled:opacity-50 ${
                active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-surface-variant bg-white text-on-surface hover:bg-surface-container-low'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <label className="mt-2 flex items-center gap-1.5 text-[11px] text-on-surface">
        <input
          type="checkbox"
          checked={hasPrereq}
          disabled={disabled || currentLayout == null}
          onChange={(e) => {
            if (currentLayout) apply(currentLayout, e.target.checked);
          }}
          className="h-3.5 w-3.5 accent-[#5c1219]"
        />
        Include prerequisite column
      </label>

      <div className="mt-2 flex flex-wrap gap-1">
        {visibleRoles.map((role) => (
          <span
            key={role}
            className="rounded-full border border-surface-variant bg-surface-container-low px-2 py-0.5 text-[10px] font-semibold text-on-surface-variant"
          >
            {COLUMN_LABELS[role]}
          </span>
        ))}
      </div>
    </div>
  );
}
