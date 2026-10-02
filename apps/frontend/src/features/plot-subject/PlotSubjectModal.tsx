import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  plotSubject,
  validatePlot,
  type PlotSubjectPayload,
} from '../../api/schedule.api';
import Icon from '../../components/ui/Icon';
import clsx from 'clsx';

const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const TIME_OPTIONS = [
  '07:00', '07:30', '08:00', '08:30', '09:00', '09:30',
  '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
];

interface SubjectOption {
  subjectId: string;
  subjectCode: string;
  title: string;
}

interface FacultyOption {
  facultyId: string;
  firstName: string;
  lastName: string;
}

interface RoomOption {
  roomId: string;
  roomNumber: string;
  roomType: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  termId: string;
  subjects: SubjectOption[];
  faculty: FacultyOption[];
  rooms: RoomOption[];
}

export default function PlotSubjectModal({
  open,
  onClose,
  termId,
  subjects,
  faculty,
  rooms,
}: Props) {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    subjectId: '',
    section: '',
    facultyId: '',
    roomId: '',
    dayOfWeek: 'Monday',
    startTime: '08:00',
    endTime: '09:30',
    loadType: 'lecture' as 'lecture' | 'laboratory' | 'other',
  });

  const [validation, setValidation] = useState<{
    valid: boolean;
    violations: string[];
  } | null>(null);

  const [touched, setTouched] = useState(false);

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setForm({
        subjectId: '',
        section: '',
        facultyId: '',
        roomId: '',
        dayOfWeek: 'Monday',
        startTime: '08:00',
        endTime: '09:30',
        loadType: 'lecture',
      });
      setValidation(null);
      setTouched(false);
    }
  }, [open]);

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
        });
        setValidation(result);
      } catch (err) {
        console.error('Validation failed:', err);
        setValidation(null);
      }
    }, 400);

    return () => clearTimeout(timeout);
  }, [open, form, termId]);

  // Plot mutation
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
    },
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validation?.valid) return;
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
  };

  if (!open) return null;

  const submitDisabled =
    plotMutation.isPending ||
    !form.subjectId ||
    !form.roomId ||
    (touched && validation?.valid === false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-surface-container-lowest rounded-xl shadow-2xl border border-surface-variant">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-variant sticky top-0 bg-surface-container-lowest z-10">
          <div>
            <h2 className="text-lg font-bold text-primary">Plot Subject</h2>
            <p className="text-xs text-on-surface-variant">
              Add a new class to the timetable
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Subject */}
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
              Subject *
            </label>
            <select
              name="subjectId"
              required
              value={form.subjectId}
              onChange={handleChange}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
            >
              <option value="">Select a subject…</option>
              {subjects.map((s) => (
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
              <input
                type="text"
                name="section"
                value={form.section}
                onChange={handleChange}
                placeholder="e.g. 1A"
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              />
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
                <option value="lecture">Lecture</option>
                <option value="laboratory">Laboratory</option>
              </select>
            </div>
          </div>

          {/* Faculty + Room */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Faculty
              </label>
              <select
                name="facultyId"
                value={form.facultyId}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">Unassigned</option>
                {faculty.map((f) => (
                  <option key={f.facultyId} value={f.facultyId}>
                    {f.lastName}, {f.firstName}
                  </option>
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
              <select
                name="startTime"
                required
                value={form.startTime}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                End *
              </label>
              <select
                name="endTime"
                required
                value={form.endTime}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              >
                {TIME_OPTIONS.slice(1).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Validation feedback */}
          {touched && validation && (
            <div
              className={clsx(
                'rounded-lg p-3 text-sm flex items-start gap-2',
                validation.valid
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-red-50 text-red-800 border border-red-200',
              )}
            >
              <Icon
                name={validation.valid ? 'check_circle' : 'error'}
                filled
                size={18}
                className="shrink-0 mt-0.5"
              />
              <div>
                {validation.valid ? (
                  <p className="font-medium">No conflicts detected ✓</p>
                ) : (
                  <>
                    <p className="font-medium">Conflicts detected:</p>
                    <ul className="mt-1 list-disc list-inside space-y-0.5">
                      {validation.violations.map((v, i) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
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
              {plotMutation.isPending ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Plotting…
                </>
              ) : (
                <>
                  <Icon name="add" size={16} />
                  Plot Subject
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}