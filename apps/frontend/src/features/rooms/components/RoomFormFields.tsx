import Icon from '../../../components/ui/Icon';
import type { RoomType } from '../../../api/rooms.api';

export interface FormState {
  roomNumber: string;
  building: string;
  roomType: RoomType;
  capacity: string;
  deptId: string;
  isShared: boolean;
}

export type FieldErrors = Partial<Record<keyof FormState, string>>;

export const EMPTY_FORM: FormState = {
  roomNumber: '',
  building: '',
  roomType: 'lecture_room',
  capacity: '',
  deptId: '',
  isShared: false,
};

export const ROOM_TYPES: { value: RoomType; label: string; icon: string }[] = [
  { value: 'lecture_room', label: 'Lecture Room', icon: 'meeting_room' },
  { value: 'laboratory', label: 'Laboratory', icon: 'science' },
  { value: 'computer_lab', label: 'Computer Lab', icon: 'computer' },
  { value: 'drafting_room', label: 'Drafting Room', icon: 'draw' },
  { value: 'other', label: 'Other', icon: 'category' },
];

export const TYPE_ICON: Record<RoomType, string> = {
  lecture_room: 'meeting_room',
  laboratory: 'science',
  computer_lab: 'computer',
  drafting_room: 'draw',
  other: 'category',
};


export const TYPE_ACCENT: Record<RoomType, string> = {
  lecture_room: 'bg-blue-100 text-blue-600 border-blue-200',
  laboratory: 'bg-amber-100 text-amber-600 border-amber-200',
  computer_lab: 'bg-purple-100 text-purple-600 border-purple-200',
  drafting_room: 'bg-emerald-100 text-emerald-600 border-emerald-200',
  other: 'bg-slate-100 text-slate-600 border-slate-200',
};

export interface StepDef {
  label: string;
  icon: string;
  description: string;
}

export const STEP_DEFS: StepDef[] = [
  { label: 'Basics', icon: 'badge', description: 'Room number & building' },
  { label: 'Details', icon: 'tune', description: 'Type & capacity' },
  {
    label: 'Ownership',
    icon: 'apartment',
    description: 'Shared or department-owned',
  },
  { label: 'Review', icon: 'fact_check', description: 'Confirm and create' },
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

export function OwnershipOption({
  selected,
  onSelect,
  icon,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left p-3 rounded-lg border transition ${
        selected
          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
          : 'border-slate-200 hover:border-primary/50'
      }`}
      aria-pressed={selected}
    >
      <div className="flex items-start gap-2">
        <Icon
          name={selected ? 'radio_button_checked' : 'radio_button_unchecked'}
          size={16}
          className={selected ? 'text-primary mt-0.5' : 'text-slate-400 mt-0.5'}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Icon name={icon} size={14} className="text-slate-500" />
            <span className="text-sm font-semibold text-slate-800">
              {title}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
    </button>
  );
}

/** Progress bar shown only in create mode. */
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