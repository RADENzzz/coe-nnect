import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchFacultyPreferences,
  addFacultyPreference,
  updateFacultyPreference,
  removeFacultyPreference,
  type FacultyPreference,
  type DayOfWeek,
} from '../../../api/faculty-preferences.api';
import type { FacultyRecord } from '../../../api/faculty.api';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import ResponsiveTable, { type Column } from '../../../components/ui/ResponsiveTable';
import type { RowAction } from '../../../components/ui/RowActionMenu';

interface Props {
  open: boolean;
  onClose: () => void;
  faculty: FacultyRecord | null;
}

const DAYS: { value: DayOfWeek; label: string; short: string }[] = [
  { value: 'MON', label: 'Monday', short: 'Mon' },
  { value: 'TUE', label: 'Tuesday', short: 'Tue' },
  { value: 'WED', label: 'Wednesday', short: 'Wed' },
  { value: 'THU', label: 'Thursday', short: 'Thu' },
  { value: 'FRI', label: 'Friday', short: 'Fri' },
  { value: 'SAT', label: 'Saturday', short: 'Sat' },
  { value: 'SUN', label: 'Sunday', short: 'Sun' },
];

const DAY_LABEL: Record<DayOfWeek, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

const TIME_PRESETS = [
  { label: 'Morning', start: '07:00', end: '12:00', icon: 'wb_sunny' },
  { label: 'Afternoon', start: '13:00', end: '17:00', icon: 'wb_twilight' },
  { label: 'Full Day', start: '07:00', end: '19:00', icon: 'schedule' },
] as const;

/** "08:00:00" → "8:00 AM" */
function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${period}`;
}

/** Duration in hours between two "HH:MM" strings */
function durationHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}

/** Do two time windows on the same day overlap? */
function overlaps(
  a: { day: DayOfWeek; start: string; end: string },
  b: { day: DayOfWeek; start: string; end: string },
): boolean {
  if (a.day !== b.day) return false;
  return a.start < b.end && b.start < a.end;
}

export default function PreferencesModal({ open, onClose, faculty }: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editTarget, setEditTarget] = useState<FacultyPreference | null>(null);
  const [removeTarget, setRemoveTarget] = useState<FacultyPreference | null>(null);

  const [form, setForm] = useState<{
    preferredDay: DayOfWeek;
    preferredStartTime: string;
    preferredEndTime: string;
  }>({
    preferredDay: 'MON',
    preferredStartTime: '08:00',
    preferredEndTime: '12:00',
  });

  const { data: prefs = [], isLoading } = useQuery({
    queryKey: ['faculty-preferences', faculty?.facultyId],
    queryFn: () => fetchFacultyPreferences(faculty!.facultyId),
    enabled: open && !!faculty,
  });

  const addMutation = useMutation({
    mutationFn: () => addFacultyPreference(faculty!.facultyId, form),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['faculty-preferences', faculty?.facultyId],
      });
      setForm((p) => ({ ...p, preferredStartTime: '08:00', preferredEndTime: '12:00' }));
      setError(null);
      setFieldErrors({});
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to add'),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; input: any }) =>
      updateFacultyPreference(faculty!.facultyId, payload.id, payload.input),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['faculty-preferences', faculty?.facultyId],
      });
      setEditTarget(null);
      setError(null);
      setFieldErrors({});
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to update'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      removeFacultyPreference(faculty!.facultyId, id),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['faculty-preferences', faculty?.facultyId],
      });
      setRemoveTarget(null);
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to remove'),
  });

  const sorted = useMemo(() => {
    return [...prefs].sort((a, b) => {
      const dayOrder: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
      const da = dayOrder.indexOf(a.preferredDay);
      const db = dayOrder.indexOf(b.preferredDay);
      if (da !== db) return da - db;
      return a.preferredStartTime.localeCompare(b.preferredStartTime);
    });
  }, [prefs]);

  /** Check if the current form conflicts with an existing pref (excluding edit target). */
  const conflict = useMemo(() => {
    if (!form.preferredStartTime || !form.preferredEndTime) return null;
    if (form.preferredStartTime >= form.preferredEndTime) return null;
    return (
      prefs.find(
        (p) =>
          p.preferenceId !== editTarget?.preferenceId &&
          overlaps(
            {
              day: form.preferredDay,
              start: form.preferredStartTime,
              end: form.preferredEndTime,
            },
            {
              day: p.preferredDay,
              start: p.preferredStartTime.slice(0, 5),
              end: p.preferredEndTime.slice(0, 5),
            },
          ),
      ) ?? null
    );
  }, [form, prefs, editTarget]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.preferredStartTime) errs.start = 'Start time is required';
    if (!form.preferredEndTime) errs.end = 'End time is required';
    if (
      form.preferredStartTime &&
      form.preferredEndTime &&
      form.preferredStartTime >= form.preferredEndTime
    ) {
      errs.end = 'End time must be after start time';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAdd = () => {
    setError(null);
    if (!validate()) return;
    addMutation.mutate();
  };

  const handleSaveEdit = () => {
    if (!editTarget) return;
    setError(null);
    if (!validate()) return;
    updateMutation.mutate({
      id: editTarget.preferenceId,
      input: {
        preferredDay: form.preferredDay,
        preferredStartTime: form.preferredStartTime,
        preferredEndTime: form.preferredEndTime,
      },
    });
  };

  const applyPreset = (start: string, end: string) => {
    setForm((p) => ({ ...p, preferredStartTime: start, preferredEndTime: end }));
    setFieldErrors({});
  };

  const columns: Column<FacultyPreference>[] = [
    {
      key: 'day',
      header: 'Day',
      cardVariant: 'title',
      cellClassName: 'text-on-surface font-medium',
      render: (p) => (
        <span className="inline-flex items-center gap-2">
          <span className="w-8 text-[10px] font-bold text-slate-400 uppercase">
            {p.preferredDay}
          </span>
          {DAY_LABEL[p.preferredDay]}
        </span>
      ),
    },
    {
      key: 'window',
      header: 'Preferred Window',
      cardVariant: 'subtitle',
      cellClassName: 'text-on-surface-variant font-mono text-xs',
      render: (p) => (
        <span>
          {fmtTime(p.preferredStartTime)} – {fmtTime(p.preferredEndTime)}
          <span className="ml-2 text-[10px] text-slate-400">
            ({durationHours(p.preferredStartTime, p.preferredEndTime).toFixed(1)}h)
          </span>
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      cardVariant: 'actions',
      render: () => null,
    },
  ];

  const getActions = (p: FacultyPreference): RowAction[] => [
    {
      label: 'Edit',
      icon: 'edit',
      onClick: () => {
        setEditTarget(p);
        setFieldErrors({});
        setForm({
          preferredDay: p.preferredDay,
          preferredStartTime: p.preferredStartTime.slice(0, 5),
          preferredEndTime: p.preferredEndTime.slice(0, 5),
        });
      },
    },
    {
      label: 'Remove',
      icon: 'delete',
      danger: true,
      onClick: () => setRemoveTarget(p),
      disabled: removeMutation.isPending,
    },
  ];

  const isEditing = !!editTarget;
  const busy = addMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Modal
        open={open && !!faculty}
        onClose={onClose}
        title="Personal Time Preferences"
        description={
          faculty ? `${faculty.lastName}, ${faculty.firstName}` : undefined
        }
        size="lg"
        footer={
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
          >
            Close
          </button>
        }
      >
        <div className="space-y-5">
          {error && (
            <div className="p-3 bg-red-100 border border-red-300 text-red-700 text-sm rounded-lg flex items-start gap-2">
              <Icon name="error" size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* F-7 hint */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900 flex items-start gap-2">
            <Icon name="info" size={16} className="shrink-0 mt-0.5" />
            <div>
              <strong>These are soft preferences, not hard blocks.</strong>{' '}
              Rule F-7 will emit a warning when a class is scheduled outside
              a preferred window, but the schedule is not rejected. Use this
              to record when the faculty member <em>prefers</em> to teach.
            </div>
          </div>

          {/* Add / Edit form */}
          <div className="rounded-lg border border-slate-200 p-4 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {isEditing ? 'Edit Preference' : 'Add Preference'}
              </p>
              {!isEditing && (
                <div className="flex gap-1">
                  {TIME_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyPreset(p.start, p.end)}
                      className="px-2 py-1 text-[10px] font-semibold text-slate-600 bg-white border border-slate-200 rounded hover:border-primary hover:text-primary transition flex items-center gap-1"
                      title={`${p.start} – ${p.end}`}
                    >
                      <Icon name={p.icon} size={11} />
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Day
                </label>
                <select
                  value={form.preferredDay}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      preferredDay: e.target.value as DayOfWeek,
                    }))
                  }
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                >
                  {DAYS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  From
                </label>
                <input
                  type="time"
                  value={form.preferredStartTime}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, preferredStartTime: e.target.value }));
                    setFieldErrors((fe) => ({ ...fe, start: '' }));
                  }}
                  className={`w-full bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 ${
                    fieldErrors.start
                      ? 'border-red-400 focus:border-red-500'
                      : 'border-slate-200 focus:border-primary'
                  }`}
                />
                {fieldErrors.start && (
                  <p className="text-[10px] text-red-600 mt-1">{fieldErrors.start}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  To
                </label>
                <input
                  type="time"
                  value={form.preferredEndTime}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, preferredEndTime: e.target.value }));
                    setFieldErrors((fe) => ({ ...fe, end: '' }));
                  }}
                  className={`w-full bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 ${
                    fieldErrors.end
                      ? 'border-red-400 focus:border-red-500'
                      : 'border-slate-200 focus:border-primary'
                  }`}
                />
                {fieldErrors.end && (
                  <p className="text-[10px] text-red-600 mt-1">{fieldErrors.end}</p>
                )}
              </div>
            </div>

            {/* Duration preview */}
            {form.preferredStartTime &&
              form.preferredEndTime &&
              form.preferredStartTime < form.preferredEndTime && (
                <p className="text-[10px] text-slate-500 flex items-center gap-1">
                  <Icon name="schedule" size={11} />
                  Duration: {durationHours(form.preferredStartTime, form.preferredEndTime).toFixed(1)} hours
                </p>
              )}

            {/* Conflict warning */}
            {conflict && (
              <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                <Icon name="warning" size={14} className="shrink-0 mt-0.5" />
                <span>
                  Overlaps with existing preference:{' '}
                  <strong>
                    {DAY_LABEL[conflict.preferredDay]}{' '}
                    {fmtTime(conflict.preferredStartTime)} –{' '}
                    {fmtTime(conflict.preferredEndTime)}
                  </strong>
                </span>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              {isEditing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditTarget(null);
                    setError(null);
                    setFieldErrors({});
                  }}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel edit
                </button>
              )}
              <button
                type="button"
                onClick={isEditing ? handleSaveEdit : handleAdd}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2"
              >
                <Icon name={isEditing ? 'save' : 'add'} size={16} />
                {busy
                  ? 'Saving…'
                  : isEditing
                  ? 'Save Changes'
                  : 'Add Preference'}
              </button>
            </div>
          </div>

          {/* List header with count */}
          {prefs.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Configured Preferences
              </p>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                {prefs.length}
              </span>
            </div>
          )}

          {/* List */}
          <ResponsiveTable
            columns={columns}
            rows={sorted}
            rowKey={(p) => p.preferenceId}
            rowTitle={(p) => DAY_LABEL[p.preferredDay]}
            rowSubtitle={(p) =>
              `${fmtTime(p.preferredStartTime)} – ${fmtTime(p.preferredEndTime)}`
            }
            isLoading={isLoading}
            hasSourceRows={prefs.length > 0}
            emptyMessage="No preferences configured. Add one above to record when this faculty prefers to teach."
            noMatchMessage="No preferences match your filters."
            getActions={getActions}
          />
        </div>
      </Modal>

      {/* Remove confirmation */}
      <Modal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title="Remove preference?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setRemoveTarget(null)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                removeTarget && removeMutation.mutate(removeTarget.preferenceId)
              }
              disabled={removeMutation.isPending}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50 rounded-lg flex items-center gap-2"
            >
              {removeMutation.isPending && (
                <Icon name="progress_activity" size={14} className="animate-spin" />
              )}
              {removeMutation.isPending ? 'Removing…' : 'Remove'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Remove the preference for{' '}
          <strong>{removeTarget && DAY_LABEL[removeTarget.preferredDay]}</strong>{' '}
          ({removeTarget && fmtTime(removeTarget.preferredStartTime)} –{' '}
          {removeTarget && fmtTime(removeTarget.preferredEndTime)})? This
          cannot be undone.
        </p>
      </Modal>
    </>
  );
}