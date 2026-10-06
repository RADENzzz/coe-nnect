import { useState } from 'react';
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

const DAYS: { value: DayOfWeek; label: string }[] = [
  { value: 'MON', label: 'Monday' },
  { value: 'TUE', label: 'Tuesday' },
  { value: 'WED', label: 'Wednesday' },
  { value: 'THU', label: 'Thursday' },
  { value: 'FRI', label: 'Friday' },
  { value: 'SAT', label: 'Saturday' },
  { value: 'SUN', label: 'Sunday' },
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

/** "08:00:00" → "8:00 AM" */
function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${period}`;
}

export default function PreferencesModal({ open, onClose, faculty }: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
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

  const sorted = [...prefs].sort((a, b) => {
    const dayOrder: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const da = dayOrder.indexOf(a.preferredDay);
    const db = dayOrder.indexOf(b.preferredDay);
    if (da !== db) return da - db;
    return a.preferredStartTime.localeCompare(b.preferredStartTime);
  });

  const columns: Column<FacultyPreference>[] = [
    {
      key: 'day',
      header: 'Day',
      cardVariant: 'title',
      cellClassName: 'text-on-surface font-medium',
      render: (p) => DAY_LABEL[p.preferredDay],
    },
    {
      key: 'window',
      header: 'Preferred Window',
      cardVariant: 'subtitle',
      cellClassName: 'text-on-surface-variant font-mono text-xs',
      render: (p) =>
        `${fmtTime(p.preferredStartTime)} – ${fmtTime(p.preferredEndTime)}`,
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

  const handleAdd = () => {
    setError(null);
    if (form.preferredStartTime >= form.preferredEndTime) {
      setError('Start time must be earlier than end time.');
      return;
    }
    addMutation.mutate();
  };

  const handleSaveEdit = () => {
    if (!editTarget) return;
    setError(null);
    if (form.preferredStartTime >= form.preferredEndTime) {
      setError('Start time must be earlier than end time.');
      return;
    }
    updateMutation.mutate({
      id: editTarget.preferenceId,
      input: {
        preferredDay: form.preferredDay,
        preferredStartTime: form.preferredStartTime,
        preferredEndTime: form.preferredEndTime,
      },
    });
  };

  const isEditing = !!editTarget;

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
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
          >
            Close
          </button>
        }
      >
        <div className="space-y-5">
          {error && (
            <div className="p-3 bg-red-100 border border-red-300 text-red-700 text-sm">
              {error}
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
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {isEditing ? 'Edit Preference' : 'Add Preference'}
            </p>
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
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
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
                  onChange={(e) =>
                    setForm((p) => ({ ...p, preferredStartTime: e.target.value }))
                  }
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  To
                </label>
                <input
                  type="time"
                  value={form.preferredEndTime}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, preferredEndTime: e.target.value }))
                  }
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              {isEditing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditTarget(null);
                    setError(null);
                  }}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel edit
                </button>
              )}
              <button
                type="button"
                onClick={isEditing ? handleSaveEdit : handleAdd}
                disabled={addMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2"
              >
                <Icon name={isEditing ? 'save' : 'add'} size={16} />
                {addMutation.isPending || updateMutation.isPending
                  ? 'Saving…'
                  : isEditing
                  ? 'Save Changes'
                  : 'Add Preference'}
              </button>
            </div>
          </div>

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
            emptyMessage="No preferences configured. Add one above."
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
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                removeTarget && removeMutation.mutate(removeTarget.preferenceId)
              }
              disabled={removeMutation.isPending}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
            >
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