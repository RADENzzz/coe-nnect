import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  plotSubject,
  plotMulti,
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
import { useAuthStore } from '../../store/auth.store';

const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const DAY_ABBR: Record<string, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
};

const TIME_OPTIONS = generateSlotBoundaries();

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
  lectureSessionsPerWeek?: number;
  labSessionsPerWeek?: number;
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
  editing?: ScheduleEntry | null;
  departments?: DepartmentOption[];
  existingCounts?: Array<{
    scheduleId: string;
    section: string | null;
    subjectId: string;
    loadType: 'lecture' | 'laboratory' | 'other';
  }>;
  presetSubjectId?: string;
}

type PlotMode = 'single' | 'multi';

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

/** Per-day time slot for multi-session mode. */
interface MultiDayRow {
  day: (typeof DAYS)[number];
  enabled: boolean;
  startTime: string;
  endTime: string;
}

export default function PlotSubjectModal({
  open,
  onClose,
  termId,
  subjects,
  faculty,
  rooms,
  editing = null,
  departments = [],
  existingCounts = [],
  presetSubjectId,
}: Props) {
  const queryClient = useQueryClient();
  const profile = useAuthStore((s) => s.profile);
  const myDeptId = profile?.dept_id != null ? String(profile.dept_id) : '';
  const isEditMode = !!editing;

  const { data: sections = [] } = useQuery({
    queryKey: ['sections'],
    queryFn: fetchSections,
    enabled: open,
  });

  const [form, setForm] = useState(EMPTY_FORM);
  const [mode, setMode] = useState<PlotMode>('single');
  const [multiDays, setMultiDays] = useState<MultiDayRow[]>(() =>
    DAYS.map((day) => ({
      day,
      enabled: false,
      startTime: '08:00',
      endTime: '09:30',
    })),
  );

  const [validation, setValidation] = useState<ValidateResult | null>(null);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [filterDept, setFilterDept] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterSem, setFilterSem] = useState('');

  const selectedSubject = subjects.find((s) => s.subjectId === form.subjectId);
  const allowsLecture = !selectedSubject || selectedSubject.lectureUnits > 0;
  const allowsLaboratory = !selectedSubject || selectedSubject.labUnits > 0;

  const startOptions = useMemo(() => TIME_OPTIONS.slice(0, -1), []);

  const endOptions = useMemo(() => {
    const startIdx = TIME_OPTIONS.indexOf(form.startTime);
    if (startIdx === -1) return TIME_OPTIONS.slice(1);
    return TIME_OPTIONS.slice(startIdx + 1);
  }, [form.startTime]);

  const filteredSubjects = useMemo(() => {
    return subjects.filter((s) => {
      if (filterDept && String(s.deptId ?? '') !== filterDept) return false;
      if (filterYear || filterSem) {
        const years = s.prospectusYears ?? [];
        if (years.length === 0) return false;
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

  useEffect(() => {
    if (!form.subjectId) return;
    const stillValid = filteredSubjects.some(
      (s) => s.subjectId === form.subjectId,
    );
    if (!stillValid) {
      setForm((prev) => ({ ...prev, subjectId: '' }));
    }
  }, [filteredSubjects, form.subjectId]);

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
    return Array.from(groups.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
  }, [faculty, departments]);

  useEffect(() => {
    const defaultDept =
      profile?.role === 'department_head' && myDeptId ? myDeptId : '';

    if (!open) {
      setForm(EMPTY_FORM);
      setMode('single');
      setMultiDays(
        DAYS.map((day) => ({
          day,
          enabled: false,
          startTime: '08:00',
          endTime: '09:30',
        })),
      );
      setValidation(null);
      setTouched(false);
      setSubmitting(false);
      setFilterDept(defaultDept);
      setFilterYear('');
      setFilterSem('');
      return;
    }
    if (editing) {
      setMode('single');
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
      setFilterDept(defaultDept);
      setFilterYear('');
      setFilterSem('');
    } else {
      // ── Fresh form, optional preset subject ──
      setForm({
        ...EMPTY_FORM,
        subjectId: presetSubjectId ?? '',
      });
      setMode('single');
      setMultiDays(
        DAYS.map((day) => ({
          day,
          enabled: false,
          startTime: '08:00',
          endTime: '09:30',
        })),
      );
      setValidation(null);
      setTouched(false);
      setSubmitting(false);
      // When opening with a preset, drop the dept filter so the preset
      // subject doesn't get auto-cleared by the validity guard below.
      setFilterDept(presetSubjectId ? '' : defaultDept);
      setFilterYear('');
      setFilterSem('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, myDeptId, profile?.role, presetSubjectId]);

  useEffect(() => {
    if (!selectedSubject) return;
    if (form.loadType === 'laboratory' && !allowsLaboratory) {
      setForm((prev) => ({ ...prev, loadType: 'lecture' }));
    } else if (form.loadType === 'lecture' && !allowsLecture) {
      setForm((prev) => ({ ...prev, loadType: 'laboratory' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubject?.subjectId, allowsLaboratory, allowsLecture]);

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

  // ── Session-limit enforcement ──
  const sessionStatus = useMemo(() => {
    if (!form.subjectId || !form.section) {
      return {
        current: 0,
        limit: null as number | null,
        exceeded: false,
        message: null as string | null,
        remaining: 0,
      };
    }

    const subject = subjects.find((s) => s.subjectId === form.subjectId);
    if (!subject) {
      return {
        current: 0,
        limit: null,
        exceeded: false,
        message: null,
        remaining: 0,
      };
    }

    const loadType = form.loadType;
    let limit: number | null = null;
    if (loadType === 'lecture') {
      limit = subject.lectureSessionsPerWeek ?? 1;
    } else if (loadType === 'laboratory') {
      limit = subject.labSessionsPerWeek ?? 1;
    }

    if (limit == null) {
      return {
        current: 0,
        limit: null,
        exceeded: false,
        message: null,
        remaining: 0,
      };
    }

    const current = existingCounts.filter(
      (e) =>
        e.subjectId === form.subjectId &&
        e.section === form.section &&
        e.loadType === loadType &&
        e.scheduleId !== editing?.id,
    ).length;

    const remaining = Math.max(0, limit - current);
    const exceeded = current >= limit;
    const message = exceeded
      ? `This section already has ${current} of ${limit} ${loadType} session${limit === 1 ? '' : 's'} plotted for ${subject.subjectCode}. The prospectus allows a maximum of ${limit}.`
      : null;

    return { current, limit, exceeded, message, remaining };
  }, [
    form.subjectId,
    form.section,
    form.loadType,
    subjects,
    existingCounts,
    editing?.id,
  ]);

  // ── Multi-day selection helpers ──
  const enabledDays = multiDays.filter((d) => d.enabled);
  const multiCount = enabledDays.length;

  const toggleDay = (day: string) => {
    setMultiDays((rows) =>
      rows.map((r) =>
        r.day === day ? { ...r, enabled: !r.enabled } : r,
      ),
    );
  };

  const updateDayTime = (
    day: string,
    field: 'startTime' | 'endTime',
    value: string,
  ) => {
    setMultiDays((rows) =>
      rows.map((r) => (r.day === day ? { ...r, [field]: value } : r)),
    );
  };

  const applyDefaultTimes = (start: string, end: string) => {
    setMultiDays((rows) =>
      rows.map((r) => ({ ...r, startTime: start, endTime: end })),
    );
  };

  // Debounced live validation (single mode only)
  useEffect(() => {
    if (mode !== 'single') return;
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
  }, [open, form, termId, editing?.id, mode]);

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

  const plotMultiMutation = useMutation({
    mutationFn: plotMulti,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules', termId] });
      onClose();
    },
    onError: (err: any) => {
      alert(
        err?.response?.data?.message ??
          err?.message ??
          'Failed to plot sessions',
      );
      setSubmitting(false);
    },
  });

  // ── EDIT 1: extended payload type ──
  const updateMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      dayOfWeek: string;
      startTime: string;
      endTime: string;
      roomId?: string;
      facultyId?: string;
      section?: string | null;
      loadType?: 'lecture' | 'laboratory' | 'other';
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

    // ── Multi-session path ──
    if (mode === 'multi') {
      if (multiCount === 0) {
        alert('Pick at least one day.');
        return;
      }
      if (sessionStatus.limit != null && multiCount > sessionStatus.remaining) {
        alert(
          `This would exceed the ${sessionStatus.limit}-session limit for this subject and section. You can plot at most ${sessionStatus.remaining} more session${sessionStatus.remaining === 1 ? '' : 's'}.`,
        );
        return;
      }
      setSubmitting(true);
      plotMultiMutation.mutate({
        termId,
        subjectId: form.subjectId,
        facultyId: form.facultyId || undefined,
        roomId: form.roomId || undefined,
        section: form.section || undefined,
        loadType: form.loadType,
        sessions: enabledDays.map((d) => ({
          dayOfWeek: d.day,
          startTime: d.startTime,
          endTime: d.endTime,
        })),
      });
      return;
    }

    // ── Single-session path ──
    if (sessionStatus.exceeded) return;

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
        // ── EDIT 2 + 3: send section (null if cleared) and loadType ──
        updateMutation.mutate({
          id: editing.id,
          dayOfWeek: form.dayOfWeek,
          startTime: form.startTime,
          endTime: form.endTime,
          roomId: form.roomId || undefined,
          facultyId: form.facultyId || undefined,
          section: form.section === '' ? null : form.section,
          loadType: form.loadType,
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

  const multiSubmitDisabled =
    submitting ||
    plotMultiMutation.isPending ||
    !form.subjectId ||
    !form.roomId ||
    !form.facultyId ||
    multiCount === 0 ||
    (sessionStatus.limit != null && multiCount > sessionStatus.remaining);

  const singleSubmitDisabled =
    submitting ||
    plotMutation.isPending ||
    updateMutation.isPending ||
    !form.subjectId ||
    !form.roomId ||
    !form.facultyId ||
    (touched && (validation?.hardConflicts.length ?? 0) > 0) ||
    sessionStatus.exceeded;

  const submitDisabled =
    mode === 'multi' ? multiSubmitDisabled : singleSubmitDisabled;

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
                : mode === 'multi'
                ? 'Plot this subject on multiple days at once'
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

        {/* ── Mode toggle (hidden in edit mode) ── */}
        {!isEditMode && (
          <div className="px-6 pt-4">
            <div
              role="tablist"
              aria-label="Plot mode"
              className="inline-flex rounded-lg border border-surface-variant bg-surface-container-low p-0.5"
            >
              <button
                role="tab"
                aria-selected={mode === 'single'}
                type="button"
                onClick={() => setMode('single')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                  mode === 'single'
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Icon name="calendar_today" size={14} />
                Single session
              </button>
              <button
                role="tab"
                aria-selected={mode === 'multi'}
                type="button"
                onClick={() => {
                  setMode('multi');
                  // Seed default times from the current single-session times
                  applyDefaultTimes(form.startTime, form.endTime);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                  mode === 'multi'
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Icon name="view_week" size={14} />
                Multi-session
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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

          {/* Session limit info */}
          {sessionStatus.limit != null &&
            form.subjectId &&
            form.section &&
            !sessionStatus.exceeded && (
              <div className="rounded-lg px-3 py-2 text-xs flex items-center gap-2 bg-blue-50 text-blue-900 border border-blue-200">
                <Icon name="info" size={14} className="shrink-0" />
                <span>
                  Plotted: <strong>{sessionStatus.current}</strong> of{' '}
                  <strong>{sessionStatus.limit}</strong> allowed{' '}
                  {form.loadType} session
                  {sessionStatus.limit === 1 ? '' : 's'} for this subject and
                  section. <strong>{sessionStatus.remaining}</strong> remaining.
                </span>
              </div>
            )}

          {sessionStatus.exceeded && sessionStatus.message && (
            <div className="rounded-lg p-3 text-sm flex items-start gap-2 bg-amber-50 text-amber-900 border border-amber-200">
              <Icon
                name="warning"
                filled
                size={18}
                className="shrink-0 mt-0.5"
              />
              <div>
                <p className="font-medium">Session limit reached</p>
                <p className="mt-0.5">{sessionStatus.message}</p>
                <p className="mt-1 text-xs text-amber-800">
                  Remove an existing session first, or increase the pattern on
                  the Prospectus page.
                </p>
              </div>
            </div>
          )}

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

          {/* ═══════════════════════════════════════════════ */}
          {/* SINGLE-SESSION: Day + Times                    */}
          {/* ═══════════════════════════════════════════════ */}
          {mode === 'single' && (
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
                  onChange={(v) =>
                    setForm((prev) => ({ ...prev, startTime: v }))
                  }
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
                  onChange={(v) =>
                    setForm((prev) => ({ ...prev, endTime: v }))
                  }
                  options={endOptions}
                  ariaLabel="End time"
                />
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════ */}
          {/* MULTI-SESSION: day checkboxes                  */}
          {/* ═══════════════════════════════════════════════ */}
          {mode === 'multi' && (
            <div className="rounded-lg border border-surface-variant bg-surface-container-lowest p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                  Pick days this class meets
                </span>
                <span className="text-xs text-on-surface-variant">
                  {multiCount} selected
                </span>
              </div>

              {/* Optional: apply a shared time to all picked days */}
              <div className="flex flex-wrap items-end gap-3 p-3 rounded-lg bg-surface-container-low">
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-[10px] font-semibold text-on-surface-variant mb-1 uppercase tracking-wider">
                    Default start
                  </label>
                  <TimeSlotSelect
                    value={multiDays[0].startTime}
                    onChange={(v) => {
                      applyDefaultTimes(v, multiDays[0].endTime);
                    }}
                    options={startOptions}
                    ariaLabel="Default start time"
                  />
                </div>
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-[10px] font-semibold text-on-surface-variant mb-1 uppercase tracking-wider">
                    Default end
                  </label>
                  <TimeSlotSelect
                    value={multiDays[0].endTime}
                    onChange={(v) => {
                      applyDefaultTimes(multiDays[0].startTime, v);
                    }}
                    options={endOptions}
                    ariaLabel="Default end time"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    applyDefaultTimes(multiDays[0].startTime, multiDays[0].endTime)
                  }
                  className="px-3 py-2 text-xs font-semibold border border-surface-variant rounded-md hover:bg-surface-container-high transition"
                >
                  Apply to all
                </button>
              </div>

              <ul className="divide-y divide-surface-variant">
                {multiDays.map((row) => (
                  <li
                    key={row.day}
                    className="py-2.5 flex flex-wrap items-center gap-3"
                  >
                    <label className="flex items-center gap-2 min-w-[110px] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={() => toggleDay(row.day)}
                        className="accent-[#5c1219] w-4 h-4"
                      />
                      <span className="text-sm font-semibold text-on-surface">
                        {DAY_ABBR[row.day] ?? row.day}
                      </span>
                    </label>
                    {row.enabled && (
                      <>
                        <div className="flex-1 min-w-[110px]">
                          <TimeSlotSelect
                            value={row.startTime}
                            onChange={(v) =>
                              updateDayTime(row.day, 'startTime', v)
                            }
                            options={startOptions}
                            ariaLabel={`${row.day} start time`}
                          />
                        </div>
                        <span className="text-xs text-on-surface-variant">
                          to
                        </span>
                        <div className="flex-1 min-w-[110px]">
                          <TimeSlotSelect
                            value={row.endTime}
                            onChange={(v) =>
                              updateDayTime(row.day, 'endTime', v)
                            }
                            options={TIME_OPTIONS.slice(
                              TIME_OPTIONS.indexOf(row.startTime) + 1,
                            )}
                            ariaLabel={`${row.day} end time`}
                          />
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>

              {sessionStatus.limit != null && (
                <p className="text-[11px] text-on-surface-variant">
                  The prospectus allows {sessionStatus.limit}{' '}
                  {form.loadType} session
                  {sessionStatus.limit === 1 ? '' : 's'}. You have{' '}
                  {sessionStatus.remaining} remaining. Pick at most{' '}
                  {sessionStatus.remaining} day
                  {sessionStatus.remaining === 1 ? '' : 's'}.
                </p>
              )}
            </div>
          )}

          {/* Validation feedback (single mode) */}
          {mode === 'single' && touched && validation && (
            <div className="space-y-2">
              {validation.hardConflicts.length > 0 && (
                <div className="rounded-lg p-3 text-sm flex items-start gap-2 bg-red-50 text-red-800 border border-red-200">
                  <Icon
                    name="error"
                    filled
                    size={18}
                    className="shrink-0 mt-0.5"
                  />
                  <div>
                    <p className="font-medium">
                      {validation.hardConflicts.length} hard conflict
                      {validation.hardConflicts.length === 1 ? '' : 's'} —
                      cannot
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
                  <Icon
                    name="warning"
                    filled
                    size={18}
                    className="shrink-0 mt-0.5"
                  />
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
              plotMultiMutation.isPending ||
              updateMutation.isPending ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  {submitting
                    ? 'Checking…'
                    : isEditMode
                    ? 'Saving…'
                    : mode === 'multi'
                    ? `Plotting ${multiCount}…`
                    : 'Plotting…'}
                </>
              ) : mode === 'multi' ? (
                <>
                  <Icon name="add" size={16} />
                  Plot {multiCount || 0} Session
                  {multiCount === 1 ? '' : 's'}
                </>
              ) : sessionStatus.exceeded ? (
                <>
                  <Icon name="block" size={16} />
                  Limit reached
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