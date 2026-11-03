import Icon from '../../../components/ui/Icon';

export interface StepDef {
  label: string;
  icon: string;
  description: string;
}

export const STEP_DEFS: StepDef[] = [
  { label: 'Who', icon: 'group', description: 'Target dept & faculty' },
  { label: 'Subject', icon: 'menu_book', description: 'What they will teach' },
  { label: 'Reason', icon: 'notes', description: 'Justify the request' },
  { label: 'Review', icon: 'fact_check', description: 'Confirm & submit' },
];

export interface FormState {
  targetDeptId: string;
  facultyMode: 'any' | 'specific';
  specificFacultyId: string;
  subjectSource: 'prospectus' | 'all';
  selectedYear: string;
  subjectId: string;
  reason: string;
  ackDuplicate: boolean;
}

export type FieldErrors = Partial<Record<keyof FormState, string>>;

export const EMPTY_FORM: FormState = {
  targetDeptId: '',
  facultyMode: 'any',
  specificFacultyId: '',
  subjectSource: 'prospectus',
  selectedYear: '1',
  subjectId: '',
  reason: '',
  ackDuplicate: false,
};

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

export function FormField({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
          <Icon name="error" size={10} />
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-on-surface-variant mt-1">{hint}</p>
      ) : null}
    </div>
  );
}