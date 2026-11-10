import Icon from '../../../components/ui/Icon';
import SearchableSelect, {
  type SearchableOption,
} from '../../../components/ui/SearchableSelect';
import type { Department } from '../../../api/departments.api';
import type { FacultyRecord } from '../../../api/faculty.api';
import type { SubjectRecord } from '../../../api/subjects.api';
import type { FacultyRequest } from '../../../api/faculty-requests.api';
import { FormField, type FormState, type FieldErrors } from './RequestFormFields';

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Step 1: Who ──
export function WhoStep({
  form,
  setField,
  fieldErrors,
  departments,
  myDeptId,
  facultyInTargetDept,
  facultyOptions,
  requestingDeptLabel,
}: {
  form: FormState;
  setField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  fieldErrors: FieldErrors;
  departments: Department[];
  myDeptId: string;
  facultyInTargetDept: FacultyRecord[];
  facultyOptions: SearchableOption[];
  requestingDeptLabel: string;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-primary/[0.04] border border-primary/15 p-3 text-xs">
        <div className="flex items-center gap-1.5 text-primary mb-1">
          <Icon name="info" size={12} />
          <span className="font-semibold uppercase tracking-wider">
            Requesting from
          </span>
        </div>
        <p className="font-mono font-bold text-on-surface text-sm">
          {requestingDeptLabel}
        </p>
      </div>

      <FormField
        label="Target Department"
        required
        error={fieldErrors.targetDeptId}
      >
        <select
          value={form.targetDeptId}
          onChange={(e) => setField('targetDeptId', e.target.value)}
          className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
        >
          <option value="">Select a department…</option>
          {departments
            .filter((d) => d.isActive && String(d.deptId) !== myDeptId)
            .map((d) => (
              <option key={d.deptId} value={d.deptId}>
                [{d.deptCode}] {d.deptName}
              </option>
            ))}
        </select>
      </FormField>

      {form.targetDeptId && (
        <FormField
          label="Faculty Preference"
          error={fieldErrors.specificFacultyId}
        >
          <div className="flex flex-col gap-2 mb-2">
            <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer">
              <input
                type="radio"
                name="facultyMode"
                checked={form.facultyMode === 'any'}
                onChange={() => setField('facultyMode', 'any')}
                className="accent-primary"
              />
              Any available faculty
            </label>
            <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer">
              <input
                type="radio"
                name="facultyMode"
                checked={form.facultyMode === 'specific'}
                onChange={() => setField('facultyMode', 'specific')}
                className="accent-primary"
              />
              Specific faculty member
            </label>
          </div>

          {form.facultyMode === 'specific' && (
            <SearchableSelect
              value={form.specificFacultyId}
              onChange={(v) => setField('specificFacultyId', v)}
              options={facultyOptions}
              placeholder="Search faculty…"
              emptyMessage={
                facultyInTargetDept.length === 0
                  ? 'No faculty in this department'
                  : 'No faculty match your search'
              }
            />
          )}
        </FormField>
      )}
    </div>
  );
}

// ── Step 2: Subject ──
export function SubjectStep({
  form,
  setField,
  fieldErrors,
  subjectOptions,
  availableYears,
  availableSubjects,
}: {
  form: FormState;
  setField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  fieldErrors: FieldErrors;
  subjectOptions: SearchableOption[];
  availableYears: number[];
  availableSubjects: SubjectRecord[];
}) {
  return (
    <div className="space-y-4">
      <FormField label="Subject Source">
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer">
            <input
              type="radio"
              name="subjectSource"
              checked={form.subjectSource === 'prospectus'}
              onChange={() => setField('subjectSource', 'prospectus')}
              className="accent-primary"
            />
            From my department's curriculum
          </label>
          <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer">
            <input
              type="radio"
              name="subjectSource"
              checked={form.subjectSource === 'all'}
              onChange={() => setField('subjectSource', 'all')}
              className="accent-primary"
            />
            Search all active subjects
          </label>
        </div>
      </FormField>

      <div
        className={
          form.subjectSource === 'prospectus'
            ? 'grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3'
            : 'grid grid-cols-1 gap-3'
        }
      >
        {form.subjectSource === 'prospectus' && (
          <FormField label="Year Level" required>
            <select
              value={form.selectedYear}
              onChange={(e) => setField('selectedYear', e.target.value)}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
            >
              {availableYears.length === 0 && (
                <option value="">No year levels</option>
              )}
              {availableYears.map((y) => (
                <option key={y} value={String(y)}>
                  {ordinal(y)} Year
                </option>
              ))}
            </select>
          </FormField>
        )}

        <FormField label="Subject" required error={fieldErrors.subjectId}>
          <SearchableSelect
            value={form.subjectId}
            onChange={(v) => setField('subjectId', v)}
            options={subjectOptions}
            placeholder="Search subject…"
            emptyMessage={
              form.subjectSource === 'prospectus'
                ? availableSubjects.length === 0
                  ? 'No subjects for this year in your prospectus'
                  : 'No subjects match your search'
                : 'No subjects match your search'
            }
          />
        </FormField>
      </div>
    </div>
  );
}

// ── Step 3: Reason ──
export function ReasonStep({
  form,
  setField,
  fieldErrors,
}: {
  form: FormState;
  setField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  fieldErrors: FieldErrors;
}) {
  return (
    <FormField
      label="Reason"
      required
      error={fieldErrors.reason}
      hint="Explain why your department needs this subject taught by another department."
    >
      <textarea
        rows={5}
        value={form.reason}
        onChange={(e) => setField('reason', e.target.value)}
        placeholder="e.g. Need a qualified instructor for this subject; our department is at capacity."
        maxLength={500}
        className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary resize-none"
      />
      <p className="text-[11px] text-on-surface-variant mt-1 text-right">
        {form.reason.length}/500
      </p>
    </FormField>
  );
}

// ── Step 4: Review ──
export function ReviewStep({
  form,
  departments,
  facultyList,
  subjects,
  requestingDeptLabel,
  duplicateRequest,
  onAckChange,
}: {
  form: FormState;
  departments: Department[];
  facultyList: FacultyRecord[];
  subjects: SubjectRecord[];
  requestingDeptLabel: string;
  duplicateRequest: FacultyRequest | null;
  onAckChange: (v: boolean) => void;
}) {
  const targetDept = departments.find(
    (d) => String(d.deptId) === form.targetDeptId,
  );
  const faculty =
    form.facultyMode === 'specific' && form.specificFacultyId
      ? facultyList.find(
          (f) => String(f.facultyId) === form.specificFacultyId,
        )
      : null;
  const subject = subjects.find(
    (s) => String(s.subjectId) === form.subjectId,
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-on-surface-variant">
        Review everything below before submitting.
      </p>

      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-4 space-y-4">
        {/* From → To */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">
            Cross-department request
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono font-bold text-primary truncate">
                {requestingDeptLabel}
              </p>
              <p className="text-[11px] text-on-surface-variant truncate">
                Requesting dept
              </p>
            </div>
            <Icon
              name="arrow_forward"
              size={16}
              className="text-on-surface-variant shrink-0"
            />
            <div className="flex-1 min-w-0 text-right">
              <p className="text-sm font-mono font-bold text-primary truncate">
                {targetDept?.deptCode ?? '—'}
              </p>
              <p className="text-[11px] text-on-surface-variant truncate">
                {targetDept?.deptName ?? 'Target dept'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 pt-3 border-t border-surface-variant">
          <div>
            <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider mb-0.5">
              Subject
            </p>
            <p className="text-sm text-on-surface">
              {subject
                ? `[${subject.subjectCode}] ${subject.title}`
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider mb-0.5">
              Faculty
            </p>
            <p className="text-sm text-on-surface">
              {faculty
                ? `${faculty.lastName}, ${faculty.firstName}`
                : 'Any qualified faculty'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider mb-0.5">
              Reason
            </p>
            <p className="text-sm text-on-surface whitespace-pre-wrap">
              {form.reason || '—'}
            </p>
          </div>
        </div>
      </div>

      {duplicateRequest && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
          <Icon name="warning" size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1 space-y-2">
            <p>
              A pending request for this subject already exists
              {duplicateRequest.facultyId ? ' (for a different faculty)' : ''}
              . Submit anyway?
            </p>
            <label className="flex items-center gap-2 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={form.ackDuplicate}
                onChange={(e) => onAckChange(e.target.checked)}
                className="accent-amber-600"
              />
              Yes, submit anyway
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Live preview — shown on steps 1-3 ──
export function LivePreview({
  form,
  departments,
  facultyList,
  subjects,
  requestingDeptLabel,
}: {
  form: FormState;
  departments: Department[];
  facultyList: FacultyRecord[];
  subjects: SubjectRecord[];
  requestingDeptLabel: string;
}) {
  const targetDept = departments.find(
    (d) => String(d.deptId) === form.targetDeptId,
  );
  const subject = form.subjectId
    ? subjects.find((s) => String(s.subjectId) === form.subjectId)
    : null;
  const faculty =
    form.facultyMode === 'specific' && form.specificFacultyId
      ? facultyList.find(
          (f) => String(f.facultyId) === form.specificFacultyId,
        )
      : null;

  const hasTarget = !!targetDept;
  const hasSubject = !!subject;
  const hasFaculty = form.facultyMode === 'any' || !!faculty;
  const isReady =
    hasTarget && hasSubject && hasFaculty && !!form.reason.trim();

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
            Ready to review
          </span>
        ) : (
          <span className="text-[9px] font-medium uppercase tracking-wider text-on-surface-variant/70">
            Incomplete
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="font-mono font-bold text-primary">
          {requestingDeptLabel}
        </span>
        <Icon
          name="arrow_forward"
          size={12}
          className="text-on-surface-variant"
        />
        <span className="font-mono font-bold">
          {targetDept ? (
            targetDept.deptCode
          ) : (
            <span className="text-on-surface-variant/50 italic font-normal">
              Target
            </span>
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-primary/10">
        {subject ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/70 text-[10px] font-semibold text-on-surface border border-surface-variant max-w-full">
            <Icon
              name="menu_book"
              size={10}
              className="opacity-70 shrink-0"
            />
            <span className="truncate">
              [{subject.subjectCode}] {subject.title}
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-transparent text-[10px] font-medium italic text-on-surface-variant/60 border border-dashed border-surface-variant">
            <Icon name="menu_book" size={10} />
            No subject
          </span>
        )}
        {faculty ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/70 text-[10px] font-semibold text-on-surface border border-surface-variant max-w-full">
            <Icon name="person" size={10} className="opacity-70 shrink-0" />
            <span className="truncate">
              {faculty.lastName}, {faculty.firstName}
            </span>
          </span>
        ) : form.facultyMode === 'any' && form.targetDeptId ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/70 text-[10px] font-semibold text-on-surface border border-surface-variant">
            <Icon name="person" size={10} className="opacity-70" />
            Any qualified
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-transparent text-[10px] font-medium italic text-on-surface-variant/60 border border-dashed border-surface-variant">
            <Icon name="person" size={10} />
            No faculty
          </span>
        )}
      </div>

      {form.reason.trim() && (
        <p className="text-[11px] text-on-surface-variant line-clamp-2 pt-1 border-t border-primary/10">
          <strong className="font-semibold">Reason:</strong>{' '}
          {form.reason.trim()}
        </p>
      )}
    </div>
  );
}