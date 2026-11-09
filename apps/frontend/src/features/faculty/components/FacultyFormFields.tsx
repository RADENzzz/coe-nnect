import Icon from '../../../components/ui/Icon';
import type { FacultyClass } from '../../../api/faculty.api';

export const CLASSIFICATIONS: {
  value: FacultyClass;
  label: string;
  icon: string;
}[] = [
  { value: 'regular', label: 'Regular', icon: 'person' },
  { value: 'part_time', label: 'Part-Time', icon: 'schedule' },
  {
    value: 'visiting_lecturer',
    label: 'Visiting Lecturer',
    icon: 'flight_takeoff',
  },
  { value: 'other', label: 'Other', icon: 'category' },
];

export const CLASS_TONE: Record<
  FacultyClass,
  'info' | 'warning' | 'purple' | 'neutral'
> = {
  regular: 'info',
  part_time: 'warning',
  visiting_lecturer: 'purple',
  other: 'neutral',
};

export interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  contact: string;
  wmsuId: string;
  employeeId: string;
  deptId: string;
  designationId: string;
  classification: FacultyClass;
  requiredHours: string;
}

export type FieldErrors = Partial<Record<keyof FormState, string>>;

export const EMPTY_FORM: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  contact: '',
  wmsuId: '',
  employeeId: '',
  deptId: '',
  designationId: '',
  classification: 'regular',
  requiredHours: '',
};

export const DEFAULT_REQUIRED_HOURS = 18;

/**
 * Derive required teaching hours from a designation's release hours.
 * Base load is 18h/week; designations release a portion of it.
 */
export function computeRequiredHours(
  releaseHours: number | null | undefined,
  baseHours: number = DEFAULT_REQUIRED_HOURS,
): number {
  const release = Number(releaseHours ?? 0);
  if (!isFinite(release) || release <= 0) return baseHours;
  return Math.max(0, baseHours - release);
}

export interface StepDef {
  label: string;
  icon: string;
  description: string;
}

export const STEP_DEFS: StepDef[] = [
  { label: 'Identity', icon: 'badge', description: 'Name & contact' },
  { label: 'Employment', icon: 'work', description: 'IDs, class & load' },
  {
    label: 'Assignment',
    icon: 'assignment_ind',
    description: 'Department & designation',
  },
  { label: 'Review', icon: 'fact_check', description: 'Confirm & create' },
];

export function inputClass(hasError: boolean): string {
  return `w-full bg-surface-container-low border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${
    hasError
      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/10'
      : 'border-surface-variant focus:border-primary focus:ring-primary/10'
  }`;
}

export function FormSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon name={icon} size={16} className="text-primary" />
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          {title}
        </h3>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      {children}
    </div>
  );
}

export function FormField({
  label,
  required,
  error,
  hint,
  warning,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  warning?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-[10px] text-rose-600 mt-1 flex items-center gap-1">
          <Icon name="error" size={10} />
          {error}
        </p>
      ) : warning ? (
        <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
          <Icon name="warning" size={10} />
          {warning}
        </p>
      ) : hint ? (
        <p className="text-[10px] text-slate-400 mt-1">{hint}</p>
      ) : null}
    </div>
  );
}

export function StepIndicator({
  currentIdx,
  steps,
}: {
  currentIdx: number;
  steps: StepDef[];
}) {
  const current = steps[currentIdx];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
          Step {currentIdx + 1} of {steps.length} · {current.label}
        </span>
        <span className="text-[10px] text-on-surface-variant truncate">
          {current.description}
        </span>
      </div>
      <div className="flex gap-1">
        {steps.map((s, i) => (
          <div
            key={s.label}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              i <= currentIdx ? 'bg-primary' : 'bg-surface-container-high'
            }`}
          />
        ))}
      </div>
    </div>
  );
}