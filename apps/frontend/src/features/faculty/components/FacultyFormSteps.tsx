import Icon from '../../../components/ui/Icon';
import StatusBadge from '../../../components/ui/StatusBadge';
import type { FacultyRecord } from '../../../api/faculty.api';
import type { Department } from '../../../api/departments.api';
import {
  CLASSIFICATIONS,
  CLASS_TONE,
  DEFAULT_REQUIRED_HOURS,
  computeRequiredHours,
  FormSection,
  FormField,
  inputClass,
  type FormState,
  type FieldErrors,
} from './FacultyFormFields';

export interface DesignationItem {
  designationId: string;
  designationName: string;
  releaseHours: number;
}

interface StepProps {
  form: FormState;
  setField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  fieldErrors: FieldErrors;
  uniqueErrors: FieldErrors;
}

// ── Step 1: Identity ──
export function IdentityStep({
  form,
  setField,
  fieldErrors,
  uniqueErrors,
}: StepProps) {
  return (
    <FormSection title="Identity" icon="badge">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          label="First Name"
          required
          error={fieldErrors.firstName}
        >
          <input
            type="text"
            name="firstName"
            value={form.firstName}
            onChange={(e) => setField('firstName', e.target.value)}
            className={inputClass(!!fieldErrors.firstName)}
            placeholder="e.g. Juan"
            autoFocus
          />
        </FormField>
        <FormField label="Last Name" required error={fieldErrors.lastName}>
          <input
            type="text"
            name="lastName"
            value={form.lastName}
            onChange={(e) => setField('lastName', e.target.value)}
            className={inputClass(!!fieldErrors.lastName)}
            placeholder="e.g. Dela Cruz"
          />
        </FormField>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <FormField
          label="Email"
          error={fieldErrors.email || uniqueErrors.email}
        >
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={(e) => setField('email', e.target.value)}
            className={inputClass(!!(fieldErrors.email || uniqueErrors.email))}
            placeholder="juan.delacruz@wmsu.edu.ph"
          />
        </FormField>
        <FormField label="Contact Number">
          <input
            type="text"
            name="contact"
            value={form.contact}
            onChange={(e) => setField('contact', e.target.value)}
            className={inputClass(false)}
            placeholder="+63 9XX XXX XXXX"
          />
        </FormField>
      </div>
    </FormSection>
  );
}

// ── Step 2: Employment ──
export function EmploymentStep({
  form,
  setField,
  fieldErrors,
  uniqueErrors,
}: StepProps) {
  return (
    <FormSection title="Employment" icon="work">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          label="WMSU ID"
          error={fieldErrors.wmsuId || uniqueErrors.wmsuId}
        >
          <input
            type="text"
            name="wmsuId"
            value={form.wmsuId}
            onChange={(e) => setField('wmsuId', e.target.value)}
            className={inputClass(!!(fieldErrors.wmsuId || uniqueErrors.wmsuId))}
            placeholder="e.g. 2020-12345"
          />
        </FormField>
        <FormField
          label="Employee ID"
          error={fieldErrors.employeeId || uniqueErrors.employeeId}
        >
          <input
            type="text"
            name="employeeId"
            value={form.employeeId}
            onChange={(e) => setField('employeeId', e.target.value)}
            className={inputClass(
              !!(fieldErrors.employeeId || uniqueErrors.employeeId),
            )}
            placeholder="e.g. EMP-00123"
          />
        </FormField>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <FormField label="Classification">
          <select
            name="classification"
            value={form.classification}
            onChange={(e) =>
              setField('classification', e.target.value as FormState['classification'])
            }
            className={inputClass(false)}
          >
            {CLASSIFICATIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          label="Required Hours"
          error={fieldErrors.requiredHours}
          hint={
            form.designationId
              ? 'Auto-set from the selected designation.'
              : `Leave blank to use the ${DEFAULT_REQUIRED_HOURS}h default.`
          }
        >
          <div className="relative">
            <input
              type="number"
              name="requiredHours"
              value={form.requiredHours}
              onChange={(e) => setField('requiredHours', e.target.value)}
              min={0}
              max={60}
              step={0.5}
              placeholder="18"
              className={`${inputClass(!!fieldErrors.requiredHours)} pr-24`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
              hours/week
            </span>
          </div>
        </FormField>
      </div>
    </FormSection>
  );
}

// ── Step 3: Assignment ──
export function AssignmentStep({
  form,
  setField,
  departments,
  designations,
  isDH,
}: StepProps & {
  departments: Department[];
  designations: DesignationItem[];
  isDH: boolean;
}) {
  const selectedDesignation = form.designationId
    ? designations.find(
        (d) => String(d.designationId) === String(form.designationId),
      )
    : null;

  return (
    <FormSection title="Assignment" icon="assignment_ind">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          label="Department"
          hint={isDH ? 'Locked to your department.' : undefined}
        >
          <select
            name="deptId"
            value={form.deptId}
            onChange={(e) => setField('deptId', e.target.value)}
            disabled={isDH}
            className={`${inputClass(false)} disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            <option value="">— None —</option>
            {departments
              .filter((d) => d.isActive)
              .map((d) => (
                <option key={d.deptId} value={d.deptId}>
                  [{d.deptCode}] {d.deptName}
                </option>
              ))}
          </select>
        </FormField>
        <FormField
          label="Designation"
          hint={
            selectedDesignation && selectedDesignation.releaseHours > 0
              ? `Auto-sets required hours to ${computeRequiredHours(
                  selectedDesignation.releaseHours,
                )}h/wk (${DEFAULT_REQUIRED_HOURS}h base − ${
                  selectedDesignation.releaseHours
                }h release).`
              : undefined
          }
        >
          <select
            name="designationId"
            value={form.designationId}
            onChange={(e) => {
              const newId = e.target.value;
              setField('designationId', newId);
              const d = newId
                ? designations.find(
                    (x) => String(x.designationId) === newId,
                  )
                : null;
              if (d) {
                setField(
                  'requiredHours',
                  String(computeRequiredHours(d.releaseHours)),
                );
              } else {
                setField('requiredHours', '');
              }
            }}
            className={inputClass(false)}
          >
            <option value="">— None —</option>
            {designations.map((d) => (
              <option key={d.designationId} value={d.designationId}>
                {d.designationName}
              </option>
            ))}
          </select>
        </FormField>
      </div>
    </FormSection>
  );
}

// ── Step 4: Review ──
export function ReviewStep({
  form,
  departments,
  designations,
}: {
  form: FormState;
  departments: Department[];
  designations: DesignationItem[];
}) {
  const dept = departments.find((x) => String(x.deptId) === form.deptId);
  const designation = designations.find(
    (x) => String(x.designationId) === form.designationId,
  );
  const classLabel =
    CLASSIFICATIONS.find((c) => c.value === form.classification)?.label ??
    form.classification.replace('_', ' ');
  const initials =
    `${form.firstName[0] ?? ''}${form.lastName[0] ?? ''}`.toUpperCase() || '?';

  return (
    <div className="space-y-3">
      <p className="text-xs text-on-surface-variant">
        Review the details below, then create the faculty record.
      </p>

      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center shrink-0">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="font-bold text-on-surface truncate">
              {form.lastName}, {form.firstName}
            </p>
            <p className="text-xs text-on-surface-variant truncate">
              {form.email || 'No email on file'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs pt-1">
          <div>
            <p className="text-on-surface-variant">Classification</p>
            <p className="font-semibold text-on-surface">{classLabel}</p>
          </div>
          <div>
            <p className="text-on-surface-variant">Required hours</p>
            <p className="font-semibold text-on-surface">
              {form.requiredHours ? `${form.requiredHours} h/week` : '18 h (default)'}
            </p>
          </div>
          <div>
            <p className="text-on-surface-variant">Department</p>
            <p className="font-semibold text-on-surface">
              {dept ? `[${dept.deptCode}] ${dept.deptName}` : '—'}
            </p>
          </div>
          <div>
            <p className="text-on-surface-variant">Designation</p>
            <p className="font-semibold text-on-surface">
              {designation?.designationName ?? '—'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Live preview — always visible ──
export function LivePreview({
  form,
  departments,
  designations,
}: {
  form: FormState;
  departments: Department[];
  designations: DesignationItem[];
}) {
  const hasName = !!form.firstName.trim() || !!form.lastName.trim();
  const hasBoth = !!form.firstName.trim() && !!form.lastName.trim();
  const initials =
    `${form.firstName[0] ?? ''}${form.lastName[0] ?? ''}`.toUpperCase() || '?';

  const displayName = hasBoth
    ? `${form.lastName}, ${form.firstName}`
    : form.firstName || form.lastName || null;

  const dept = departments.find((x) => String(x.deptId) === form.deptId);
  const designation = designations.find(
    (x) => String(x.designationId) === form.designationId,
  );
  const classLabel =
    CLASSIFICATIONS.find((c) => c.value === form.classification)?.label ??
    'Regular';

  const isReady = hasBoth;

  return (
    <div className="rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.04] via-primary/[0.02] to-transparent p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Icon name="preview" size={14} className="text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
            Live preview
          </span>
        </div>
        {isReady ? (
          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 px-1.5 py-0.5 rounded-full border border-emerald-500/30">
            <Icon name="check_circle" size={9} />
            Ready to create
          </span>
        ) : (
          <span className="text-[9px] font-medium uppercase tracking-wider text-on-surface-variant/70">
            Incomplete
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-full bg-primary/15 text-primary text-sm font-bold flex items-center justify-center shrink-0 border border-primary/25">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-base text-on-surface truncate leading-tight">
            {displayName ?? (
              <span className="italic font-normal text-on-surface-variant/50">
                New faculty
              </span>
            )}
          </p>
          <p className="text-xs text-on-surface-variant truncate mt-0.5">
            {form.email || form.contact || (
              <span className="italic opacity-60">No contact on file</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-primary/10">
        <StatusBadge tone={CLASS_TONE[form.classification]}>
          {classLabel}
        </StatusBadge>
        {dept ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/70 text-[10px] font-semibold text-on-surface border border-surface-variant">
            <Icon name="apartment" size={10} className="opacity-70" />
            {dept.deptCode}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-transparent text-[10px] font-medium italic text-on-surface-variant/60 border border-dashed border-surface-variant">
            <Icon name="apartment" size={10} />
            No dept
          </span>
        )}
        {designation && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/70 text-[10px] font-semibold text-on-surface border border-surface-variant">
            <Icon name="workspace_premium" size={10} className="opacity-70" />
            {designation.designationName}
          </span>
        )}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/70 text-[10px] font-semibold text-on-surface border border-surface-variant">
          <Icon name="schedule" size={10} className="opacity-70" />
          {form.requiredHours ? `${form.requiredHours}h/wk` : '18h/wk'}
        </span>
      </div>
    </div>
  );
}