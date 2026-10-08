import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  plotSubject,
  updateSchedule,
  validatePlot,
  type PlotSubjectPayload,
  type ValidateResult,
} from '../../api/schedule.api';
import { fetchSections } from '../../api/sections.api';
import type { ScheduleEntry } from '../timetable/types';
import Icon from '../../components/ui/Icon';
import TimeSlotSelect from '../../components/ui/TimeSlotSelect';
import {
  generateSlotBoundaries,
  formatTime,
} from '../timetable/utils/time.util';

const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/**
 * Boundaries inclusive of operating-hours end (19:00).
 * Values stay 24h internally; display is AM/PM via formatTime().
 */
const TIME_OPTIONS = generateSlotBoundaries(); // ['07:00', ..., '18:30', '19:00']

const DAY_ABBR_TO_FULL: Record<string, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

interface SubjectOption {
  subjectId: string;
  subjectCode: string;
  title: string;
  lectureUnits: number;
  labUnits: number;
  deptId?: string;
  prospectusYears?: Array<{ yearLevel: number; semester: string }>;
}

interface FacultyOption {
  facultyId: string;
  firstName: string;
  lastName: string;
  deptId?: string | null;
}

interface RoomOption {
  roomId: string;
  roomNumber: string;
  roomType: string;
}

interface DepartmentOption {
  deptId: string;
  deptCode: string;
  deptName: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  termId: string;
  subjects: SubjectOption[];
  faculty: FacultyOption[];
  rooms: RoomOption[];
  /** When provided, the modal runs in edit mode. */
  editing?: ScheduleEntry | null;
  departments?: DepartmentOption[];
}

const EMPTY_FORM = {
  subjectId: '',
  section: '',
  facultyId: '',
  roomId: '',
  dayOfWeek: 'Monday',
  startTime: '08:00',
  endTime: '09:30',
  loadType: 'lecture' as 'lecture' | 'laboratory' | 'other',
};

export default function PlotSubjectModal({
  open,
  onClose,
  termId,
  subjects,
  faculty,
  rooms,
  editing = null,
  departments = [],
}: Props) {
  const queryClient = useQueryClient();
  const isEditMode = !!editing;

  const { data: sections = [] } = useQuery({
    queryKey: ['sections'],
    queryFn: fetchSections,
    enabled: open,
  });

  const [form, setForm] = useState(EMPTY_FORM);
  const [validation, setValidation] = useState<ValidateResult | null>(null);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Filter state ──
  const [filterDept, setFilterDept] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterSem, setFilterSem] = useState('');

  const selectedSubject = subjects.find((s) => s.subjectId === form.subjectId);
  const allowsLecture = !selectedSubject || selectedSubject.lectureUnits > 0;
  const allowsLaboratory = !selectedSubject || selectedSubject.labUnits > 0;

  // Start times: all boundaries except the last (can't start at 19:00)
  const startOptions = useMemo(() => TIME_OPTIONS.slice(0, -1), []);

  // End times: boundaries strictly after the selected start
  const endOptions = useMemo(() => {
    const startIdx = TIME_OPTIONS.indexOf(form.startTime);
    if (startIdx === -1) return TIME_OPTIONS.slice(1);
    return TIME_OPTIONS.slice(startIdx + 1);
  }, [form.startTime]);

  // ── Filtered subject list ──
  const filteredSubjects = useMemo(() => {
    return subjects.filter((s) => {
      if (filterDept && String(s.deptId ?? '') !== filterDept) return false;
      if (filterYear || filterSem) {
        const years = s.prospectusYears ?? [];
        if (years.length === 0) return false; // No prospectus entry — exclude
        const match = years.some((y) => {
          if (filterYear && String(y.yearLevel) !== filterYear) return false;
          if (filterSem && y.semester !== filterSem) return false;
          return true;
        });
        if (!match) return false;
      }
      return true;
    });
  }, [subjects, filterDept, filterYear, filterSem]);

  // Clear selected subject if filters make it invalid
  useEffect(() => {
    if (!form.subjectId) return;
    const stillValid = filteredSubjects.some(
      (s) => s.subjectId === form.subjectId,
    );
    if (!stillValid) {
      setForm((prev) => ({ ...prev, subjectId: '' }));
    }
  }, [filteredSubjects, form.subjectId]);

  // ── Faculty grouped by department ──
  const facultyGroups = useMemo(() => {
    const groups = new Map<string, FacultyOption[]>();
    for (const f of faculty) {
      const dept = departments.find(
        (d) => String(d.deptId) === String(f.deptId ?? ''),
      );
      const label = dept
        ? `[${dept.deptCode}] ${dept.deptName}`
        : 'Unassigned';
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(f);
    }
    // Return as sorted array of [label, faculty[]] entries
    return Array.from(groups.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
  }, [faculty, departments]);

  // Prefill / reset when the modal opens or the editing target changes
  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      setValidation(null);
      setTouched(false);
      setSubmitting(false);
      setFilterDept('');
      setFilterYear('');
      setFilterSem('');
      return;
    }
    if (editing) {
      setForm({
        subjectId: editing.subjectId,
        section: editing.sectionCode ?? '',
        facultyId: editing.facultyId ?? '',
        roomId: editing.roomId ?? '',
        dayOfWeek: DAY_ABBR_TO_FULL[editing.day] ?? 'Monday',
        startTime: editing.startTime,
        endTime: editing.endTime,
        loadType: (editing.loadType ?? 'lecture') as
          | 'lecture'
          | 'laboratory'
          | 'other',
      });
      setValidation(null);
      setTouched(false);
      setSubmitting(false);
    } else {
      setForm(EMPTY_FORM);
      setValidation(null);
      setTouched(false);
      setSubmitting(false);
    }
  }, [open, editing]);

  // Auto-correct load type when the subject changes
  useEffect(() => {
    if (!selectedSubject) return;
    if (form.loadType === 'laboratory' && !allowsLaboratory) {
      setForm((prev) => ({ ...prev, loadType: 'lecture' }));
    } else if (form.loadType === 'lecture' && !allowsLecture) {
      setForm((prev) => ({ ...prev, loadType: 'laboratory' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubject?.subjectId, allowsLaboratory, allowsLecture]);

  // If start time changes and end time is now invalid, bump end time
  useEffect(() => {
    const startIdx = TIME_OPTIONS.indexOf(form.startTime);
    const endIdx = TIME_OPTIONS.indexOf(form.endTime);
    if (startIdx !== -1 && endIdx !== -1 && endIdx <= startIdx) {
      const nextEnd = TIME_OPTIONS[startIdx + 1];
      if (nextEnd) {
        setForm((prev) => ({ ...prev, endTime: nextEnd }));
      }
    }
  }, [form.startTime, form.endTime]);

  // Debounced live validation
  useEffect(() => {
    if (!open || !form.subjectId || !form.roomId || !form.dayOfWeek) return;

    setTouched(true);
    const timeout = setTimeout(async () => {
      try {
        const result = await validatePlot({
          termId,
          subjectId: form.subjectId,
          facultyId: form.facultyId || undefined,
          roomId: form.roomId || undefined,
          section: form.section || undefined,
          dayOfWeek: form.dayOfWeek,
          startTime: form.startTime,
          endTime: form.endTime,
          loadType: form.loadType,
          excludeId: editing?.id,
        });
        setValidation(result);
      } catch (err) {
        console.error('Validation failed:', err);
        setValidation(null);
      }
    }, 400);

    return () => clearTimeout(timeout);
  }, [open, form, termId, editing?.id]);

  const plotMutation = useMutation({
    mutationFn: (payload: PlotSubjectPayload) => plotSubject(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules', termId] });
      onClose();
    },
    onError: (err: any) => {
      alert(
        err?.response?.data?.message ?? err?.message ?? 'Failed to plot subject',
      );
      setSubmitting(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      dayOfWeek: string;
      startTime: string;
      endTime: string;
      roomId?: string;
      facultyId?: string;
    }) => updateSchedule(payload.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules', termId] });
      onClose();
    },
    onError: (err: any) => {
      alert(
        err?.response?.data?.message ??
          err?.message ??
          'Failed to update schedule entry',
      );
      setSubmitting(false);
    },
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.facultyId) return;
    if (submitting) return;

    setSubmitting(true);
    try {
      const fresh = await validatePlot({
        termId,
        subjectId: form.subjectId,
        facultyId: form.facultyId || undefined,
        roomId: form.roomId || undefined,
        section: form.section || undefined,
        dayOfWeek: form.dayOfWeek,
        startTime: form.startTime,
        endTime: form.endTime,
        loadType: form.loadType,
        excludeId: editing?.id,
      });

      setValidation(fresh);
      setTouched(true);

      if (fresh.hardConflicts.length > 0) {
        setSubmitting(false);
        return;
      }

      if (isEditMode && editing) {
        updateMutation.mutate({
          id: editing.id,
          dayOfWeek: form.dayOfWeek,
          startTime: form.startTime,
          endTime: form.endTime,
          roomId: form.roomId || undefined,
          facultyId: form.facultyId || undefined,
        });
      } else {
        plotMutation.mutate({
          termId,
          subjectId: form.subjectId,
          facultyId: form.facultyId || undefined,
          roomId: form.roomId || undefined,
          section: form.section || undefined,
          loadType: form.loadType,
          dayOfWeek: form.dayOfWeek,
          startTime: form.startTime,
          endTime: form.endTime,
        });
      }
    } catch (err) {
      console.error('Pre-flight validate failed:', err);
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const submitDisabled =
    submitting ||
    plotMutation.isPending ||
    updateMutation.isPending ||
    !form.subjectId ||
    !form.roomId ||
    !form.facultyId ||
    (touched && (validation?.hardConflicts.length ?? 0) > 0);

  const hasActiveFilter = filterDept || filterYear || filterSem;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-surface-container-lowest rounded-xl shadow-2xl border border-surface-variant">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-variant sticky top-0 bg-surface-container-lowest z-10">
          <div>
            <h2 className="text-lg font-bold text-primary">
              {isEditMode ? 'Edit Class' : 'Plot Subject'}
            </h2>
            <p className="text-xs text-on-surface-variant">
              {isEditMode
                ? 'Modify day, time, room, or faculty'
                : 'Add a new class to the timetable'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant"
          >
            <Icon name="close" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* ── Filters ── (hidden in edit mode since subject is locked) */}
          {!isEditMode && (
            <div className="rounded-lg border border-surface-variant bg-surface-container-low p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">
                  Filter subjects
                </span>
                {hasActiveFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterDept('');
                      setFilterYear('');
                      setFilterSem('');
                    }}
                    className="text-[10px] text-primary hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <select
                  value={filterDept}
                  onChange={(e) => setFilterDept(e.target.value)}
                  className="w-full bg-white border border-surface-variant rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                >
                  <option value="">All departments</option>
                  {departments.map((d) => (
                    <option key={d.deptId} value={d.deptId}>
                      [{d.deptCode}] {d.deptName}
                    </option>
                  ))}
                </select>
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className="w-full bg-white border border-surface-variant rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                >
                  <option value="">Any year</option>
                  <option value="1">1st Year</option>
                  <option value="2">2nd Year</option>
                  <option value="3">3rd Year</option>
                  <option value="4">4th Year</option>
                </select>
                <select
                  value={filterSem}
                  onChange={(e) => setFilterSem(e.target.value)}
                  className="w-full bg-white border border-surface-variant rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                >
                  <option value="">Any semester</option>
                  <option value="1st">1st</option>
                  <option value="2nd">2nd</option>
                  <option value="summer">Summer</option>
                </select>
              </div>
            </div>
          )}

          {/* Subject */}
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
              Subject *
              {isEditMode && (
                <span className="ml-2 text-[10px] font-normal normal-case tracking-normal text-on-surface-variant">
                  (locked in edit mode)
                </span>
              )}
            </label>
            <select
              name="subjectId"
              required
              value={form.subjectId}
              onChange={handleChange}
              disabled={isEditMode}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">
                {filteredSubjects.length === 0
                  ? 'No subjects match your filters'
                  : `Select a subject… (${filteredSubjects.length} available)`}
              </option>
              {filteredSubjects.map((s) => (
                <option key={s.subjectId} value={s.subjectId}>
                  [{s.subjectCode}] {s.title}
                </option>
              ))}
            </select>
          </div>

          {/* Section + Load Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Section
              </label>
              <select
                name="section"
                value={form.section}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">— none —</option>
                {sections
                  .filter((s) => s.isActive)
                  .map((s) => (
                    <option key={s.sectionId} value={s.sectionCode}>
                      {s.sectionCode}
                      {s.studentCount != null
                        ? ` (${s.studentCount} students)`
                        : ''}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Load Type *
              </label>
              <select
                name="loadType"
                required
                value={form.loadType}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              >
                <option value="lecture" disabled={!allowsLecture}>
                  Lecture {!allowsLecture ? '(no lecture component)' : ''}
                </option>
                <option value="laboratory" disabled={!allowsLaboratory}>
                  Laboratory {!allowsLaboratory ? '(no lab component)' : ''}
                </option>
              </select>
              {selectedSubject && (
                <p className="text-[10px] text-on-surface-variant mt-1 leading-tight">
                  {selectedSubject.lectureUnits > 0 &&
                    `${selectedSubject.lectureUnits}L`}
                  {selectedSubject.lectureUnits > 0 &&
                    selectedSubject.labUnits > 0 &&
                    ' + '}
                  {selectedSubject.labUnits > 0 &&
                    `${selectedSubject.labUnits}Lab`}
                  {selectedSubject.lectureUnits === 0 &&
                    selectedSubject.labUnits === 0 &&
                    'This subject has no component units.'}
                </p>
              )}
            </div>
          </div>

          {/* Faculty + Room */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Faculty *
              </label>
              <select
                name="facultyId"
                required
                value={form.facultyId}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">Select a faculty…</option>
                {facultyGroups.map(([label, facs]) => (
                  <optgroup key={label} label={label}>
                    {facs.map((f) => (
                      <option key={f.facultyId} value={f.facultyId}>
                        {f.lastName}, {f.firstName}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Room *
              </label>
              <select
                name="roomId"
                required
                value={form.roomId}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">Select a room…</option>
                {rooms.map((r) => (
                  <option key={r.roomId} value={r.roomId}>
                    Room {r.roomNumber} ({r.roomType.replace('_', ' ')})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Day + Times */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Day *
              </label>
              <select
                name="dayOfWeek"
                required
                value={form.dayOfWeek}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              >
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Start *
              </label>
              <TimeSlotSelect
                value={form.startTime}
                onChange={(v) => setForm((prev) => ({ ...prev, startTime: v }))}
                options={startOptions}
                ariaLabel="Start time"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                End *
              </label>
              <TimeSlotSelect
                value={form.endTime}
                onChange={(v) => setForm((prev) => ({ ...prev, endTime: v }))}
                options={endOptions}
                ariaLabel="End time"
              />
            </div>
          </div>

          {/* Validation feedback */}
          {touched && validation && (
            <div className="space-y-2">
              {validation.hardConflicts.length > 0 && (
                <div className="rounded-lg p-3 text-sm flex items-start gap-2 bg-red-50 text-red-800 border border-red-200">
                  <Icon name="error" filled size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">
                      {validation.hardConflicts.length} hard conflict
                      {validation.hardConflicts.length === 1 ? '' : 's'} — cannot
                      {isEditMode ? ' save' : ' plot'}:
                    </p>
                    <ul className="mt-1 list-disc list-inside space-y-0.5">
                      {validation.hardConflicts.map((c) => (
                        <li key={c.ruleId}>
                          <span className="font-mono text-xs opacity-70">
                            {c.ruleId}
                          </span>{' '}
                          {c.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {validation.softWarnings.length > 0 && (
                <div className="rounded-lg p-3 text-sm flex items-start gap-2 bg-amber-50 text-amber-900 border border-amber-200">
                  <Icon name="warning" filled size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">
                      {validation.softWarnings.length} warning
                      {validation.softWarnings.length === 1 ? '' : 's'}:
                    </p>
                    <ul className="mt-1 list-disc list-inside space-y-0.5">
                      {validation.softWarnings.map((w) => (
                        <li key={w.ruleId}>
                          <span className="font-mono text-xs opacity-70">
                            {w.ruleId}
                          </span>{' '}
                          {w.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {validation.hardConflicts.length === 0 &&
                validation.softWarnings.length === 0 && (
                  <div className="rounded-lg p-3 text-sm flex items-start gap-2 bg-green-50 text-green-800 border border-green-200">
                    <Icon
                      name="check_circle"
                      filled
                      size={18}
                      className="shrink-0 mt-0.5"
                    />
                    <p className="font-medium">No conflicts detected ✓</p>
                  </div>
                )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-surface-variant">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container-low rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitDisabled}
              className="px-6 py-2 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
            >
              {submitting ||
              plotMutation.isPending ||
              updateMutation.isPending ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  {submitting
                    ? 'Checking…'
                    : isEditMode
                    ? 'Saving…'
                    : 'Plotting…'}
                </>
              ) : (
                <>
                  <Icon name={isEditMode ? 'save' : 'add'} size={16} />
                  {isEditMode ? 'Save Changes' : 'Plot Subject'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}