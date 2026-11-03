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
import WeeklyAvailabilityGrid, { type GridBlock } from './WeeklyAvailabilityGrid';

interface Props { open: boolean; onClose: () => void; faculty: FacultyRecord | null; }

const DAY_LABEL: Record<DayOfWeek, string> = {
  MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday',
  FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday',
};
const DAY_TO_ENUM: Record<string, DayOfWeek> = {
  Monday: 'MON', Tuesday: 'TUE', Wednesday: 'WED', Thursday: 'THU',
  Friday: 'FRI', Saturday: 'SAT', Sunday: 'SUN',
};

const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toHHMM = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
const sameBlock = (a: GridBlock, b: GridBlock) =>
  a.day === b.day && a.startMin === b.startMin && a.endMin === b.endMin;
const gridHas = (list: GridBlock[], b: GridBlock) => list.some((x) => sameBlock(x, b));
const extractMessage = (err: unknown) => {
  const e = err as any;
  return e?.response?.data?.message ?? e?.message ?? 'unknown error';
};

export default function PreferencesModal({ open, onClose, faculty }: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [draftBlocks, setDraftBlocks] = useState<GridBlock[]>([]);
  const [confirmClose, setConfirmClose] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const prefsKey = useMemo(
    () => ['faculty-preferences', faculty?.facultyId] as const,
    [faculty?.facultyId],
  );

  const { data: prefs = [], isLoading } = useQuery({
    queryKey: prefsKey,
    queryFn: () => fetchFacultyPreferences(faculty!.facultyId),
    enabled: open && !!faculty,
  });
  const { data: unavailability = [] } = useQuery({
    queryKey: ['faculty-unavailability', faculty?.facultyId],
    queryFn: () => fetchFacultyUnavailability(faculty!.facultyId),
    enabled: open && !!faculty,
  });

  const savedBlocks: GridBlock[] = useMemo(
    () => prefs.map((p) => ({
      day: DAY_LABEL[p.preferredDay],
      startMin: toMinutes(p.preferredStartTime),
      endMin: toMinutes(p.preferredEndTime),
    })),
    [prefs],
  );
  const contextBlocks: GridBlock[] = useMemo(
    () => unavailability.map((u) => ({
      day: u.dayOfWeek,
      startMin: toMinutes(u.startTime),
      endMin: toMinutes(u.endTime),
    })),
    [unavailability],
  );

  useEffect(() => {
    if (!open) return;
    setDraftBlocks(savedBlocks);
    setError(null);
    setSuccess(null);
    setIsSaving(false);
    setJustSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, faculty?.facultyId, prefs.length]);

  const addMutation = useMutation({
    mutationFn: (input: { preferredDay: DayOfWeek; preferredStartTime: string; preferredEndTime: string }) =>
      addFacultyPreference(faculty!.facultyId, input),
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => removeFacultyPreference(faculty!.facultyId, id),
  });

  const diff = useMemo(() => {
    const toRemove = prefs.filter((p) => {
      const b: GridBlock = {
        day: DAY_LABEL[p.preferredDay],
        startMin: toMinutes(p.preferredStartTime),
        endMin: toMinutes(p.preferredEndTime),
      };
      return !gridHas(draftBlocks, b);
    });
    const toAdd = draftBlocks.filter((b) => !gridHas(savedBlocks, b));
    return { toRemove, toAdd, removed: toRemove.length, added: toAdd.length };
  }, [prefs, savedBlocks, draftBlocks]);

  const hasChanges = diff.added > 0 || diff.removed > 0;

  const overlapsUnavailability = useMemo(
    () => draftBlocks.filter((b) =>
      contextBlocks.some((c) => c.day === b.day && b.startMin < c.endMin && c.startMin < b.endMin),
    ),
    [draftBlocks, contextBlocks],
  );

  const handleSave = async () => {
    if (!hasChanges || isSaving) return;
    setError(null);
    setSuccess(null);
    setIsSaving(true);

    const previous = qc.getQueryData<FacultyPreference[]>(prefsKey);

    // ⚡ Optimistic write — cache reflects the new state immediately.
    const optimistic: FacultyPreference[] = [
      ...prefs.filter((p) => !diff.toRemove.some((r) => r.preferenceId === p.preferenceId)),
      ...diff.toAdd.map((b, i) => ({
        preferenceId: `temp-${Date.now()}-${i}`,
        facultyId: faculty!.facultyId,
        preferredDay: DAY_TO_ENUM[b.day],
        preferredStartTime: toHHMM(b.startMin),
        preferredEndTime: toHHMM(b.endMin),
      })),
    ];
    qc.setQueryData(prefsKey, optimistic);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);

    const errors: string[] = [];

    try {
      if (diff.toRemove.length > 0) {
        const results = await Promise.allSettled(
          diff.toRemove.map((p) => removeMutation.mutateAsync(p.preferenceId)),
        );
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            errors.push(
              `Failed to remove ${DAY_LABEL[diff.toRemove[i].preferredDay]} ${diff.toRemove[i].preferredStartTime}: ${extractMessage(r.reason)}`,
            );
          }
        });
      }
      if (diff.toAdd.length > 0) {
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
              `Failed to add ${diff.toAdd[i].day} ${toHHMM(diff.toAdd[i].startMin)}: ${extractMessage(r.reason)}`,
            );
          }
        });
      }

      if (errors.length > 0) {
        if (previous) qc.setQueryData(prefsKey, previous);
        setJustSaved(false);
        setError(
          `${errors.length} operation${errors.length === 1 ? '' : 's'} failed:\n` +
          errors.slice(0, 3).join('\n') +
          (errors.length > 3 ? `\n…and ${errors.length - 3} more` : ''),
        );
      } else {
        setSuccess('Preferences saved.');
        qc.invalidateQueries({ queryKey: prefsKey });
        qc.invalidateQueries({ queryKey: ['faculty-status-summary'] });
        qc.invalidateQueries({ queryKey: ['faculty'] });
      }
    } catch (err) {
      if (previous) qc.setQueryData(prefsKey, previous);
      setJustSaved(false);
      setError(extractMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 3500);
    return () => clearTimeout(t);
  }, [success]);

  const handleRequestClose = useCallback(() => {
    if (hasChanges && !isSaving) setConfirmClose(true);
    else onClose();
  }, [hasChanges, isSaving, onClose]);

  const saveLabel = justSaved && !hasChanges ? 'Saved' : hasChanges ? 'Save changes' : 'No changes';

  return (
    <>
      <Modal
        open={open && !!faculty}
        onClose={handleRequestClose}
        title="Personal Time Preferences"
        description={faculty ? `${faculty.lastName}, ${faculty.firstName}` : undefined}
        size="lg"
        footer={
          <>
            {justSaved && !hasChanges && (
              <span className="mr-auto text-xs text-emerald-700 font-semibold self-center inline-flex items-center gap-1">
                <Icon name="check_circle" size={14} /> Saved
              </span>
            )}
            {!justSaved && hasChanges && (
              <span className="mr-auto text-xs text-slate-500 self-center">
                <span className="text-emerald-700 font-semibold">+{diff.added}</span>
                {' / '}
                <span className="text-rose-700 font-semibold">−{diff.removed}</span>
                {' pending'}
              </span>
            )}
            <button
              type="button"
              onClick={handleRequestClose}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition disabled:opacity-50 rounded-lg active:scale-[0.98]"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isLoading || !hasChanges}
              className="px-4 py-2 text-sm font-semibold bg-primary text-white hover:opacity-90 transition disabled:opacity-50 rounded-lg flex items-center gap-2 active:scale-[0.98]"
            >
              {justSaved && !hasChanges && <Icon name="check" size={14} />}
              {saveLabel}
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
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900 flex items-start gap-2">
            <Icon name="event_available" size={16} className="shrink-0 mt-0.5" />
            <div>
              <strong>Soft preferences, not hard blocks.</strong> Rule F-7 emits
              a warning when a class is scheduled outside a preferred window,
              but the schedule is not rejected.
            </div>
          </div>
          {overlapsUnavailability.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-start gap-2">
              <Icon name="warning" size={16} className="shrink-0 mt-0.5" />
              <div>
                <strong>
                  {overlapsUnavailability.length} preferred window
                  {overlapsUnavailability.length === 1 ? '' : 's'} overlap unavailability.
                </strong>{' '}
                These will still be saved as soft preferences, but H-14 will
                block any scheduling during the overlapping time.
              </div>
            </div>
          )}
          {isLoading ? (
            <div className="border border-slate-200 rounded-lg p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-6 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <WeeklyAvailabilityGrid
              blocks={draftBlocks}
              onChange={setDraftBlocks}
              savedBlocks={savedBlocks}
              contextBlocks={contextBlocks}
              variant="preferred"
            />
          )}
        </div>
      </Modal>

      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="Discard unsaved changes?"
        size="sm"
        footer={
          <>
            <button type="button" onClick={() => setConfirmClose(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg">Keep editing</button>
            <button type="button" onClick={() => { setConfirmClose(false); onClose(); }} className="px-4 py-2 text-sm font-semibold bg-rose-600 text-white hover:bg-rose-700 transition rounded-lg">Discard</button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          You have {diff.added} pending addition{diff.added === 1 ? '' : 's'} and{' '}
          {diff.removed} pending removal{diff.removed === 1 ? '' : 's'} that haven't been saved.
        </p>
      </Modal>
    </>
  );
}