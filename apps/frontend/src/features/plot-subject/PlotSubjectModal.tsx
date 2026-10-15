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
type FacultyMode = 'system' | 'external';
type RoomMode = 'system' | 'external';

const EMPTY_FORM = {
  subjectId: '',
  section: '',
  facultyId: '',
  externalFacultyName: '',
  roomId: '',
  externalRoomName: '',
  dayOfWeek: 'Monday',
  startTime: '08:00',
  endTime: '09:30',
  loadType: 'lecture' as 'lecture' | 'laboratory' | 'other',
};

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
  const [facultyMode, setFacultyMode] = useState<FacultyMode>('system');
  const [roomMode, setRoomMode] = useState<RoomMode>('system');
  const [validation, setValidation] = useState<ValidateResult | null>(null);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [pendingConfirm, setPendingConfirm] = useState<null | {
    payloadKind: 'single' | 'multi';
  }>(null);

  const [filterDept, setFilterDept] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterSem, setFilterSem] = useState('');
  const [sectionYearOverride, setSectionYearOverride] = useState(false);

  const selectedSubject = subjects.find((s) => s.subjectId === form.subjectId);
  const allowsLecture = !selectedSubject || selectedSubject.lectureUnits > 0;
  const allowsLaboratory = !selectedSubject || selectedSubject.labUnits > 0;

  const selectedFaculty = faculty.find(
    (f) => f.facultyId === form.facultyId,
  );

  const isCrossDeptSelection = useMemo(() => {
    if (facultyMode !== 'system') return false;
    if (!selectedFaculty?.deptId) return false;
    if (!selectedSubject?.deptId) return false;
    return (
      String(selectedFaculty.deptId) !== String(selectedSubject.deptId)
    );
  }, [facultyMode, selectedFaculty, selectedSubject]);

  const crossDeptName = useMemo(() => {
    if (!isCrossDeptSelection || !selectedFaculty?.deptId) return null;
    const d = departments.find(
      (x) => String(x.deptId) === String(selectedFaculty.deptId),
    );
    return d ? `[${d.deptCode}] ${d.deptName}` : null;
  }, [isCrossDeptSelection, selectedFaculty, departments]);

  /**
   * When the subject is a minor (taught by another department/college),
   * the room is usually not in our internal `room` table. Auto-default
   * the room mode to 'external' when a minor subject is selected and
   * the user hasn't already picked an internal room.
   *
   * The user can still override by picking 'From list' — a minor
   * subject occasionally meets in a room we do manage.
   */
  useEffect(() => {
    if (isEditMode) return; // don't auto-flip during edit
    if (!selectedSubject) return;
    // Minor heuristic: deptId differs from the DH's own dept
    const isMinorSubject =
      !!selectedSubject.deptId &&
      !!myDeptId &&
      String(selectedSubject.deptId) !== myDeptId;
    if (isMinorSubject && !form.roomId) {
      setRoomMode('external');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubject?.subjectId, isEditMode]);

  const subjectYearLevels = useMemo(() => {
    if (!selectedSubject) return [] as number[];
    const years = selectedSubject.prospectusYears ?? [];
    return Array.from(new Set(years.map((y) => y.yearLevel))).sort(
      (a, b) => a - b,
    );
  }, [selectedSubject]);

  const autoYearFilter = useMemo<number | null>(() => {
    if (isEditMode) return null;
    if (subjectYearLevels.length !== 1) return null;
    return subjectYearLevels[0];
  }, [isEditMode, subjectYearLevels]);

  const sectionsForDisplay = useMemo(() => {
    const activeSections = sections.filter((s) => s.isActive);
    if (sectionYearOverride) return activeSections;
    if (autoYearFilter == null) return activeSections;
    return activeSections.filter((s) => s.yearLevel === autoYearFilter);
  }, [sections, autoYearFilter, sectionYearOverride]);

  useEffect(() => {
    if (isEditMode) return;
    if (autoYearFilter == null || sectionYearOverride) return;
    if (!form.section) return;
    const stillVisible = sectionsForDisplay.some(
      (s) => s.sectionCode === form.section,
    );
    if (!stillVisible) {
      setForm((prev) => ({ ...prev, section: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoYearFilter, sectionYearOverride, sectionsForDisplay, isEditMode]);

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
      setFacultyMode('system');
      setRoomMode('system');
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
      const hasExternalFaculty = !!editing.externalFacultyName;
      const hasExternalRoom = !!editing.externalRoomName;
      setFacultyMode(hasExternalFaculty ? 'external' : 'system');
      setRoomMode(hasExternalRoom && !editing.roomId ? 'external' : 'system');
      setForm({
        subjectId: editing.subjectId,
        section: editing.sectionCode ?? '',
        facultyId: editing.facultyId ?? '',
        externalFacultyName: editing.externalFacultyName ?? '',
        roomId: editing.roomId ?? '',
        externalRoomName: editing.externalRoomName ?? '',
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
      setForm({
        ...EMPTY_FORM,
        subjectId: presetSubjectId ?? '',
      });
      setMode('single');
      setRoomMode('system');
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

  useEffect(() => {
    if (mode !== 'single') return;
    if (!open || !form.subjectId) return;
    if (!form.roomId && !form.externalRoomName) return;
    if (!form.dayOfWeek) return;

    setTouched(true);
    const timeout = setTimeout(async () => {
      try {
        const result = await validatePlot({
          termId,
          subjectId: form.subjectId,
          facultyId:
            facultyMode === 'system' ? form.facultyId || undefined : undefined,
          roomId: roomMode === 'system' ? form.roomId || undefined : undefined,
          externalRoomName:
            roomMode === 'external'
              ? form.externalRoomName.trim() || undefined
              : undefined,
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
  }, [open, form, termId, editing?.id, mode, facultyMode, roomMode]);

  const invalidateAfterMutation = () => {
    queryClient.invalidateQueries({ queryKey: ['schedules', termId] });
    queryClient.invalidateQueries({ queryKey: ['faculty-requests'] });
    queryClient.invalidateQueries({ queryKey: ['unplotted-minors'] });
    queryClient.invalidateQueries({ queryKey: ['flagged'] });
  };

  const plotMutation = useMutation({
    mutationFn: (payload: PlotSubjectPayload) => plotSubject(payload),
    onSuccess: () => {
      invalidateAfterMutation();
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
      invalidateAfterMutation();
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

  const updateMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      dayOfWeek: string;
      startTime: string;
      endTime: string;
      roomId?: string | null;
      externalRoomName?: string | null;
      facultyId?: string | null;
      externalFacultyName?: string | null;
      section?: string | null;
      loadType?: 'lecture' | 'laboratory' | 'other';
    }) => updateSchedule(payload.id, payload),
    onSuccess: () => {
      invalidateAfterMutation();
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

  const fireSubmit = async () => {
    const extRoomTrimmed = form.externalRoomName.trim();

    if (mode === 'multi') {
      setSubmitting(true);
      const extName = form.externalFacultyName.trim();
      plotMultiMutation.mutate({
        termId,
        subjectId: form.subjectId,
        facultyId:
          facultyMode === 'system' ? form.facultyId || undefined : undefined,
        externalFacultyName:
          facultyMode === 'external' && extName ? extName : undefined,
        roomId: roomMode === 'system' ? form.roomId || undefined : undefined,
        externalRoomName:
          roomMode === 'external' && extRoomTrimmed
            ? extRoomTrimmed
            : undefined,
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

    setSubmitting(true);
    try {
      const fresh = await validatePlot({
        termId,
        subjectId: form.subjectId,
        facultyId:
          facultyMode === 'system' ? form.facultyId || undefined : undefined,
        roomId: roomMode === 'system' ? form.roomId || undefined : undefined,
        externalRoomName:
          roomMode === 'external' && extRoomTrimmed
            ? extRoomTrimmed
            : undefined,
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
          roomId: roomMode === 'system' ? form.roomId || null : null,
          externalRoomName:
            roomMode === 'external'
              ? extRoomTrimmed || null
              : null,
          facultyId:
            facultyMode === 'system' ? form.facultyId || null : null,
          externalFacultyName:
            facultyMode === 'external'
              ? form.externalFacultyName.trim() || null
              : null,
          section: form.section === '' ? null : form.section,
          loadType: form.loadType,
        });
      } else {
        const extName = form.externalFacultyName.trim();
        plotMutation.mutate({
          termId,
          subjectId: form.subjectId,
          facultyId:
            facultyMode === 'system'
              ? form.facultyId || undefined
              : undefined,
          externalFacultyName:
            facultyMode === 'external' && extName ? extName : undefined,
          roomId: roomMode === 'system' ? form.roomId || undefined : undefined,
          externalRoomName:
            roomMode === 'external' && extRoomTrimmed
              ? extRoomTrimmed
              : undefined,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const hasSystemFaculty = facultyMode === 'system' && !!form.facultyId;
    const hasExternalFaculty =
      facultyMode === 'external' && form.externalFacultyName.trim().length > 0;

    if (!hasSystemFaculty && !hasExternalFaculty) {
      return;
    }

    const hasRoom =
      (roomMode === 'system' && !!form.roomId) ||
      (roomMode === 'external' && form.externalRoomName.trim().length > 0);

    if (!hasRoom) {
      return;
    }

    if (isCrossDeptSelection && !isEditMode) {
      setPendingConfirm({
        payloadKind: mode === 'multi' ? 'multi' : 'single',
      });
      return;
    }

    await fireSubmit();
  };

  if (!open) return null;

  const hasFaculty =
    (facultyMode === 'system' && !!form.facultyId) ||
    (facultyMode === 'external' && form.externalFacultyName.trim().length > 0);

  const hasRoom =
    (roomMode === 'system' && !!form.roomId) ||
    (roomMode === 'external' && form.externalRoomName.trim().length > 0);

  const multiSubmitDisabled =
    submitting ||
    plotMultiMutation.isPending ||
    !form.subjectId ||
    !hasRoom ||
    !hasFaculty ||
    multiCount === 0 ||
    (sessionStatus.limit != null && multiCount > sessionStatus.remaining);

  const singleSubmitDisabled =
    submitting ||
    plotMutation.isPending ||
    updateMutation.isPending ||
    !form.subjectId ||
    !hasRoom ||
    !hasFaculty ||
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
                {sectionsForDisplay.map((s) => (
                  <option key={s.sectionId} value={s.sectionCode}>
                    {s.sectionCode}
                    {s.yearLevel != null ? ` — Y${s.yearLevel}` : ''}
                    {s.studentCount != null
                      ? ` (${s.studentCount} students)`
                      : ''}
                  </option>
                ))}
              </select>

              {autoYearFilter != null && !sectionYearOverride && (
                <p className="text-[10px] text-on-surface-variant mt-1 flex items-center gap-1">
                  <Icon name="filter_alt" size={11} />
                  Filtered to <strong>Year {autoYearFilter}</strong> based on
                  this subject's prospectus.
                  <button
                    type="button"
                    onClick={() => setSectionYearOverride(true)}
                    className="text-primary hover:underline font-semibold"
                  >
                    Show all years
                  </button>
                </p>
              )}

              {autoYearFilter == null &&
                !isEditMode &&
                subjectYearLevels.length > 1 && (
                  <p className="text-[10px] text-on-surface-variant mt-1 flex items-center gap-1">
                    <Icon name="info" size={11} />
                    This subject spans{' '}
                    {subjectYearLevels.map((y) => `Y${y}`).join(' / ')} — showing
                    all sections.
                  </p>
                )}

              {sectionYearOverride && autoYearFilter != null && (
                <p className="text-[10px] text-on-surface-variant mt-1 flex items-center gap-1">
                  <Icon name="filter_alt_off" size={11} />
                  Showing all years.
                  <button
                    type="button"
                    onClick={() => setSectionYearOverride(false)}
                    className="text-primary hover:underline font-semibold"
                  >
                    Re-filter to Y{autoYearFilter}
                  </button>
                </p>
              )}
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Faculty *
              </label>

              <div
                role="tablist"
                aria-label="Faculty source"
                className="inline-flex w-full rounded-lg border border-surface-variant bg-surface-container-low p-0.5 mb-2"
              >
                <button
                  role="tab"
                  aria-selected={facultyMode === 'system'}
                  type="button"
                  onClick={() => setFacultyMode('system')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                    facultyMode === 'system'
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <Icon name="badge" size={14} />
                  System faculty
                </button>
                <button
                  role="tab"
                  aria-selected={facultyMode === 'external'}
                  type="button"
                  onClick={() => setFacultyMode('external')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                    facultyMode === 'external'
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <Icon name="person_edit" size={14} />
                  External
                </button>
              </div>

              {facultyMode === 'system' && (
                <>
                  <select
                    name="facultyId"
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
                  <p className="text-[10px] text-on-surface-variant mt-1">
                    Use this for faculty in the system. Overload, qualification,
                    and preference checks will apply.
                  </p>
                </>
              )}

              {facultyMode === 'external' && (
                <>
                  <input
                    type="text"
                    name="externalFacultyName"
                    value={form.externalFacultyName}
                    onChange={handleChange}
                    placeholder="e.g. Prof. Juan Dela Cruz (Math Dept)"
                    maxLength={120}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                  />
                  <p className="text-[10px] text-on-surface-variant mt-1">
                    For professors outside the system (Math, GenEd, EPIC,
                    visiting lecturers). No overload or qualification checks
                    will apply.
                  </p>
                </>
              )}

              {isCrossDeptSelection && (
                <div className="mt-2 rounded-lg px-2.5 py-2 text-[11px] flex items-start gap-2 bg-amber-50 text-amber-900 border border-amber-200">
                  <Icon
                    name="hourglass_top"
                    size={14}
                    className="shrink-0 mt-0.5"
                  />
                  <div>
                    <p className="font-semibold">
                      Cross-department faculty
                    </p>
                    <p className="mt-0.5 leading-tight">
                      This faculty is from{' '}
                      <strong>{crossDeptName ?? 'another department'}</strong>.
                      Plotting will create a pending approval request.
                      Finalization is blocked until that department head
                      approves.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Room *
              </label>

              <div
                role="tablist"
                aria-label="Room source"
                className="inline-flex w-full rounded-lg border border-surface-variant bg-surface-container-low p-0.5 mb-2"
              >
                <button
                  role="tab"
                  aria-selected={roomMode === 'system'}
                  type="button"
                  onClick={() => setRoomMode('system')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                    roomMode === 'system'
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <Icon name="meeting_room" size={14} />
                  From list
                </button>
                <button
                  role="tab"
                  aria-selected={roomMode === 'external'}
                  type="button"
                  onClick={() => setRoomMode('external')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                    roomMode === 'external'
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <Icon name="home_work" size={14} />
                  External
                </button>
              </div>

              {roomMode === 'system' && (
                <>
                  <select
                    name="roomId"
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
                  <p className="text-[10px] text-on-surface-variant mt-1">
                    Room type and overlap rules apply. Use this for rooms we
                    manage.
                  </p>
                </>
              )}

              {roomMode === 'external' && (
                <>
                  <input
                    type="text"
                    name="externalRoomName"
                    value={form.externalRoomName}
                    onChange={handleChange}
                    placeholder="e.g. Math Building Room 204"
                    maxLength={120}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                  />
                  <p className="text-[10px] text-on-surface-variant mt-1">
                    For rooms outside the system (another college's room,
                    renovation overflow, off-site). Room rules skip — the
                    section is still reserved for this time.
                  </p>
                </>
              )}
            </div>
          </div>

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
                  <Icon
                    name={isCrossDeptSelection ? 'send' : 'add'}
                    size={16}
                  />
                  {isCrossDeptSelection ? 'Request & Plot' : 'Plot'}{' '}
                  {multiCount || 0} Session
                  {multiCount === 1 ? '' : 's'}
                </>
              ) : sessionStatus.exceeded ? (
                <>
                  <Icon name="block" size={16} />
                  Limit reached
                </>
              ) : (
                <>
                  <Icon
                    name={
                      isEditMode
                        ? 'save'
                        : isCrossDeptSelection
                        ? 'send'
                        : 'add'
                    }
                    size={16}
                  />
                  {isEditMode
                    ? 'Save Changes'
                    : isCrossDeptSelection
                    ? 'Request & Plot'
                    : 'Plot Subject'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {pendingConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !submitting && setPendingConfirm(null)}
          />
          <div className="relative w-full max-w-md bg-surface-container-lowest rounded-xl shadow-2xl border border-surface-variant p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Icon
                name="hourglass_top"
                filled
                size={24}
                className="text-amber-600 shrink-0 mt-0.5"
              />
              <div>
                <h3 className="text-base font-bold text-on-surface">
                  Cross-department faculty request
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  You're about to plot{' '}
                  <strong>{selectedSubject?.subjectCode}</strong> using{' '}
                  <strong>
                    {selectedFaculty?.lastName}, {selectedFaculty?.firstName}
                  </strong>{' '}
                  from{' '}
                  <strong>
                    {crossDeptName ?? 'another department'}
                  </strong>
                  .
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1.5">
              <p className="font-semibold">What happens next:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>
                  A <strong>pending approval request</strong> is created.
                </li>
                <li>
                  The faculty's department head is notified on their
                  Approvals page.
                </li>
                <li>
                  The class is plotted in <strong>draft</strong> status
                  immediately — no wait.
                </li>
                <li>
                  It <strong>cannot be finalized</strong> until that
                  department approves.
                </li>
              </ul>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingConfirm(null)}
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low rounded-lg transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setPendingConfirm(null);
                  await fireSubmit();
                }}
                disabled={submitting}
                className="px-5 py-2 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:bg-tertiary disabled:opacity-50 transition flex items-center gap-2"
              >
                <Icon name="send" size={16} />
                Send request & plot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}