import { useEffect, useMemo, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchFacultyPreferences,
  addFacultyPreference,
  removeFacultyPreference,
  type FacultyPreference,
  type DayOfWeek,
} from '../../../api/faculty-preferences.api';
import { fetchFacultyUnavailability } from '../../../api/faculty-unavailability.api';
import type { FacultyRecord } from '../../../api/faculty.api';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import WeeklyAvailabilityGrid, {
  type GridBlock,
} from './WeeklyAvailabilityGrid';

interface Props {
  open: boolean;
  onClose: () => void;
  faculty: FacultyRecord | null;
}

const DAY_LABEL: Record<DayOfWeek, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

/** Grid day names → API DayOfWeek enum. */
const DAY_TO_ENUM: Record<string, DayOfWeek> = {
  Monday: 'MON',
  Tuesday: 'TUE',
  Wednesday: 'WED',
  Thursday: 'THU',
  Friday: 'FRI',
  Saturday: 'SAT',
  Sunday: 'SUN',
};

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function sameBlock(a: GridBlock, b: GridBlock): boolean {
  return a.day === b.day && a.startMin === b.startMin && a.endMin === b.endMin;
}

function gridHas(list: GridBlock[], b: GridBlock): boolean {
  return list.some((x) => sameBlock(x, b));
}

export default function PreferencesModal({ open, onClose, faculty }: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [draftBlocks, setDraftBlocks] = useState<GridBlock[]>([]);
  const [confirmClose, setConfirmClose] = useState(false);
  const [savingPhase, setSavingPhase] = useState<'idle' | 'removing' | 'adding'>(
    'idle',
  );

  // ── Queries ──
  const { data: prefs = [], isLoading } = useQuery({
    queryKey: ['faculty-preferences', faculty?.facultyId],
    queryFn: () => fetchFacultyPreferences(faculty!.facultyId),
    enabled: open && !!faculty,
  });

  // Unavailability is shown as read-only context — you can see it, but not
  // paint preferences over it and not modify it from this modal.
  const { data: unavailability = [] } = useQuery({
    queryKey: ['faculty-unavailability', faculty?.facultyId],
    queryFn: () => fetchFacultyUnavailability(faculty!.facultyId),
    enabled: open && !!faculty,
  });

  // Convert saved preferences → grid blocks (full day names).
  const savedBlocks: GridBlock[] = useMemo(
    () =>
      prefs.map((p) => ({
        day: DAY_LABEL[p.preferredDay],
        startMin: toMinutes(p.preferredStartTime),
        endMin: toMinutes(p.preferredEndTime),
      })),
    [prefs],
  );

  // Convert unavailability → context overlay blocks.
  const contextBlocks: GridBlock[] = useMemo(
    () =>
      unavailability.map((u) => ({
        day: u.dayOfWeek,
        startMin: toMinutes(u.startTime),
        endMin: toMinutes(u.endTime),
      })),
    [unavailability],
  );

  // Sync draft whenever modal opens / saved data changes.
  useEffect(() => {
    if (!open) return;
    setDraftBlocks(savedBlocks);
    setError(null);
    setSuccess(null);
    setSavingPhase('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, faculty?.facultyId, prefs.length]);

  // ── Mutations ──
  const addMutation = useMutation({
    mutationFn: (input: {
      preferredDay: DayOfWeek;
      preferredStartTime: string;
      preferredEndTime: string;
    }) => addFacultyPreference(faculty!.facultyId, input),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeFacultyPreference(faculty!.facultyId, id),
  });

  const saving = savingPhase === 'removing' || savingPhase === 'adding';

  // ── Diff ──
  const diff = useMemo(() => {
    const toRemove: FacultyPreference[] = prefs.filter((p) => {
      const b: GridBlock = {
        day: DAY_LABEL[p.preferredDay],
        startMin: toMinutes(p.preferredStartTime),
        endMin: toMinutes(p.preferredEndTime),
      };
      return !gridHas(draftBlocks, b);
    });

    const toAdd: GridBlock[] = draftBlocks.filter(
      (b) => !gridHas(savedBlocks, b),
    );

    return {
      toRemove,
      toAdd,
      removed: toRemove.length,
      added: toAdd.length,
    };
  }, [prefs, savedBlocks, draftBlocks]);

  const hasChanges = diff.added > 0 || diff.removed > 0;

  // ── F-7 / H-14 overlap hint ──
  const overlapsUnavailability = useMemo(() => {
    return draftBlocks.filter((b) =>
      contextBlocks.some(
        (c) =>
          c.day === b.day && b.startMin < c.endMin && c.startMin < b.endMin,
      ),
    );
  }, [draftBlocks, contextBlocks]);

  // ── Save ──
  const handleSave = async () => {
    if (!hasChanges || saving) return;
    setError(null);
    setSuccess(null);

    const errors: string[] = [];

    try {
      if (diff.toRemove.length > 0) {
        setSavingPhase('removing');
        const results = await Promise.allSettled(
          diff.toRemove.map((p) => removeMutation.mutateAsync(p.preferenceId)),
        );
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            errors.push(
              `Failed to remove ${DAY_LABEL[diff.toRemove[i].preferredDay]} ${
                diff.toRemove[i].preferredStartTime
              }: ${
                (r.reason as any)?.response?.data?.message ??
                (r.reason as any)?.message ??
                'unknown error'
              }`,
            );
          }
        });
      }

      if (diff.toAdd.length > 0) {
        setSavingPhase('adding');
        const results = await Promise.allSettled(
          diff.toAdd.map((b) =>
            addMutation.mutateAsync({
              preferredDay: DAY_TO_ENUM[b.day],
              preferredStartTime: toHHMM(b.startMin),
              preferredEndTime: toHHMM(b.endMin),
            }),
          ),
        );
        results.forEach((r, i) => {
                   if (r.status === 'rejected') {
            errors.push(
              `Failed to add ${diff.toAdd[i].day} ${toHHMM(
                diff.toAdd[i].startMin,
              )}: ${
                (r.reason as any)?.response?.data?.message ??
                (r.reason as any)?.message ??
                'unknown error'
              }`,
            );
          }
        });
      }

      if (errors.length > 0) {
        setError(
          `${errors.length} operation${errors.length === 1 ? '' : 's'} failed:\n` +
            errors.slice(0, 3).join('\n') +
            (errors.length > 3 ? `\n…and ${errors.length - 3} more` : ''),
        );
        setSavingPhase('idle');
        // Still refresh so partial success is reflected.
        qc.invalidateQueries({
          queryKey: ['faculty-preferences', faculty?.facultyId],
        });
        qc.invalidateQueries({ queryKey: ['faculty-status-summary'] });
        qc.invalidateQueries({ queryKey: ['faculty'] });
        return;
      }

      setSavingPhase('idle');
      setSuccess('Preferences saved.');
      qc.invalidateQueries({
        queryKey: ['faculty-preferences', faculty?.facultyId],
      });
      qc.invalidateQueries({ queryKey: ['faculty-status-summary'] });
      qc.invalidateQueries({ queryKey: ['faculty'] });
    } catch (err) {
      setError(
        (err as any)?.response?.data?.message ??
          (err as any)?.message ??
          'Save failed',
      );
      setSavingPhase('idle');
    }
  };

  // Auto-dismiss success
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 3500);
    return () => clearTimeout(t);
  }, [success]);

  const handleRequestClose = useCallback(() => {
    if (hasChanges && !saving) {
      setConfirmClose(true);
    } else {
      onClose();
    }
  }, [hasChanges, saving, onClose]);

  return (
    <>
      <Modal
        open={open && !!faculty}
        onClose={handleRequestClose}
        title="Personal Time Preferences"
        description={
          faculty ? `${faculty.lastName}, ${faculty.firstName}` : undefined
        }
        size="lg"
        footer={
          <>
            {hasChanges && (
              <span className="mr-auto text-xs text-slate-500 self-center">
                <span className="text-emerald-700 font-semibold">
                  +{diff.added}
                </span>
                {' / '}
                <span className="text-rose-700 font-semibold">
                  −{diff.removed}
                </span>
                {' pending'}
              </span>
            )}
            <button
              type="button"
              onClick={handleRequestClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition disabled:opacity-50 rounded-lg"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || isLoading || !hasChanges}
              className="px-4 py-2 text-sm font-semibold bg-primary text-white hover:opacity-90 transition disabled:opacity-50 rounded-lg flex items-center gap-2"
            >
              {saving && (
                <Icon
                  name="progress_activity"
                  size={14}
                  className="animate-spin"
                />
              )}
              {saving
                ? savingPhase === 'removing'
                  ? 'Removing old windows…'
                  : 'Adding new windows…'
                : hasChanges
                ? 'Save changes'
                : 'No changes'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="p-3 bg-red-100 border border-red-300 text-red-700 text-xs rounded-lg flex items-start gap-2 whitespace-pre-line">
              <Icon name="error" size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="p-3 bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs rounded-lg flex items-start gap-2">
              <Icon name="check_circle" size={16} className="shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {/* F-7 hint */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900 flex items-start gap-2">
            <Icon
              name="event_available"
              size={16}
              className="shrink-0 mt-0.5"
            />
            <div>
              <strong>Soft preferences, not hard blocks.</strong> Rule F-7
              emits a warning when a class is scheduled outside a preferred
              window, but the schedule is not rejected. Use these to record
              when the faculty member <em>prefers</em> to teach.
            </div>
          </div>

          {/* Overlap hint (F-7 + H-14) */}
          {overlapsUnavailability.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-start gap-2">
              <Icon name="warning" size={16} className="shrink-0 mt-0.5" />
              <div>
                <strong>
                  {overlapsUnavailability.length} preferred window
                  {overlapsUnavailability.length === 1 ? '' : 's'} overlap
                  unavailability.
                </strong>{' '}
                These will still be saved as soft preferences, but H-14 will
                block any scheduling during the overlapping time. Consider
                removing or moving these windows.
              </div>
            </div>
          )}

          {/* Grid (hero) */}
          <div>
            {isLoading ? (
              <div className="border border-slate-200 rounded-lg p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-6 bg-slate-100 rounded animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <WeeklyAvailabilityGrid
                blocks={draftBlocks}
                onChange={setDraftBlocks}
                savedBlocks={savedBlocks}
                contextBlocks={contextBlocks}
                variant="preferred"
                disabled={saving}
              />
            )}
          </div>

          {/* Change summary */}
          {hasChanges && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 flex items-center gap-3 flex-wrap">
              <span className="font-semibold text-slate-700">
                Pending changes:
              </span>
              {diff.added > 0 && (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <Icon name="add_circle" size={12} />
                  {diff.added} to add
                </span>
              )}
              {diff.removed > 0 && (
                <span className="inline-flex items-center gap-1 text-rose-700">
                  <Icon name="remove_circle" size={12} />
                  {diff.removed} to remove
                </span>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Unsaved changes confirmation */}
      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="Discard unsaved changes?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirmClose(false)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Keep editing
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmClose(false);
                onClose();
              }}
              className="px-4 py-2 text-sm font-semibold bg-rose-600 text-white hover:bg-rose-700 transition rounded-lg"
            >
              Discard
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          You have {diff.added} pending addition
          {diff.added === 1 ? '' : 's'} and {diff.removed} pending removal
          {diff.removed === 1 ? '' : 's'} that haven't been saved. If you close
          now, these changes will be lost.
        </p>
      </Modal>
    </>
  );
}