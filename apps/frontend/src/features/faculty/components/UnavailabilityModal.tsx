import { useEffect, useMemo, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchFacultyUnavailability,
  addFacultyUnavailability,
  removeFacultyUnavailability,
  type FacultyUnavailability,
  type FullDayName,
} from '../../../api/faculty-unavailability.api';
import { fetchFacultyPreferences } from '../../../api/faculty-preferences.api';
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
  termId?: string;
}

const DAY_ORDER: FullDayName[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const DAY_SHORT: Record<FullDayName, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun',
};

/** API DayOfWeek enum → full day names (for the grid). */
const ENUM_TO_DAY: Record<string, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
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

function fmtTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${period}`;
}

function sameBlock(a: GridBlock, b: GridBlock): boolean {
  return a.day === b.day && a.startMin === b.startMin && a.endMin === b.endMin;
}

function gridHas(list: GridBlock[], b: GridBlock): boolean {
  return list.some((x) => sameBlock(x, b));
}

export default function UnavailabilityModal({
  open,
  onClose,
  faculty,
  termId,
}: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [draftBlocks, setDraftBlocks] = useState<GridBlock[]>([]);
  const [confirmClose, setConfirmClose] = useState(false);
  const [savingPhase, setSavingPhase] = useState<'idle' | 'removing' | 'adding'>(
    'idle',
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Load existing unavailability ──
  const { data: existing = [], isLoading } = useQuery({
    queryKey: ['faculty-unavailability', faculty?.facultyId, termId],
    queryFn: () => fetchFacultyUnavailability(faculty!.facultyId, termId),
    enabled: open && !!faculty,
  });

  // ── Load preferences (read-only context) ──
  const { data: preferences = [] } = useQuery({
    queryKey: ['faculty-preferences', faculty?.facultyId],
    queryFn: () => fetchFacultyPreferences(faculty!.facultyId),
    enabled: open && !!faculty,
  });

  const localExisting = useMemo(
    () => existing.filter((u) => u.source === 'local'),
    [existing],
  );
  const idpExisting = useMemo(
    () => existing.filter((u) => u.source === 'idp'),
    [existing],
  );

  const savedBlocks: GridBlock[] = useMemo(
    () =>
      localExisting.map((u) => ({
        day: u.dayOfWeek,
        startMin: toMinutes(u.startTime),
        endMin: toMinutes(u.endTime),
      })),
    [localExisting],
  );

  const lockedBlocks: GridBlock[] = useMemo(
    () =>
      idpExisting.map((u) => ({
        day: u.dayOfWeek,
        startMin: toMinutes(u.startTime),
        endMin: toMinutes(u.endTime),
      })),
    [idpExisting],
  );

  // Preferences → context overlay blocks.
  const contextBlocks: GridBlock[] = useMemo(
    () =>
      preferences.map((p) => ({
        day: ENUM_TO_DAY[p.preferredDay] ?? p.preferredDay,
        startMin: toMinutes(p.preferredStartTime),
        endMin: toMinutes(p.preferredEndTime),
      })),
    [preferences],
  );

  // Rebuild draft when modal opens / term changes / saved data arrives.
  useEffect(() => {
    if (!open) return;
    setDraftBlocks(savedBlocks);
    setReason('');
    setError(null);
    setSuccess(null);
    setSavingPhase('idle');
    setShowAdvanced(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, termId, existing.length]);

  // ── Mutations ──
  const addMutation = useMutation({
    mutationFn: (payload: {
      dayOfWeek: FullDayName;
      startTime: string;
      endTime: string;
      reason?: string;
    }) => addFacultyUnavailability(faculty!.facultyId, { ...payload, termId }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      removeFacultyUnavailability(faculty!.facultyId, id),
  });

  const saving = savingPhase === 'removing' || savingPhase === 'adding';

  // ── Diff (true delta) ──
  const diff = useMemo(() => {
    const toRemove = localExisting.filter((u) => {
      const b: GridBlock = {
        day: u.dayOfWeek,
        startMin: toMinutes(u.startTime),
        endMin: toMinutes(u.endTime),
      };
      return !gridHas(draftBlocks, b);
    });

    const toAdd = draftBlocks.filter((b) => !gridHas(savedBlocks, b));

    return {
      toRemove,
      toAdd,
      preserved: idpExisting.length,
      removed: toRemove.length,
      added: toAdd.length,
    };
  }, [localExisting, idpExisting.length, savedBlocks, draftBlocks]);

  const hasChanges = diff.added > 0 || diff.removed > 0;

  // ── F-7 / H-14 overlap hint ──
  const overlapsPreferences = useMemo(() => {
    return draftBlocks.filter((b) =>
      contextBlocks.some(
        (c) => c.day === b.day && b.startMin < c.endMin && c.startMin < b.endMin,
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
          diff.toRemove.map((u) =>
            removeMutation.mutateAsync(u.unavailabilityId),
          ),
        );
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            errors.push(
              `Failed to remove ${diff.toRemove[i].dayOfWeek} ${
                diff.toRemove[i].startTime
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
              dayOfWeek: b.day as FullDayName,
              startTime: toHHMM(b.startMin),
              endTime: toHHMM(b.endMin),
              reason: reason.trim() || undefined,
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
        qc.invalidateQueries({ queryKey: ['faculty-unavailability'] });
        qc.invalidateQueries({ queryKey: ['faculty-status-summary'] });
        qc.invalidateQueries({ queryKey: ['faculty'] });
        return;
      }

      // Success — refresh everything the page and modal depend on.
      setSavingPhase('idle');
      setSuccess('Unavailability saved.');
      setReason('');
      qc.invalidateQueries({ queryKey: ['faculty-unavailability'] });
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

  const sortedExisting = useMemo(() => {
    return [...existing].sort((a, b) => {
      const da = DAY_ORDER.indexOf(a.dayOfWeek);
      const db = DAY_ORDER.indexOf(b.dayOfWeek);
      if (da !== db) return da - db;
      return a.startTime.localeCompare(b.startTime);
    });
  }, [existing]);

  return (
    <>
      <Modal
        open={open && !!faculty}
        onClose={handleRequestClose}
        title="Faculty Unavailability"
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
                  ? 'Removing old blocks…'
                  : 'Adding new blocks…'
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

          {/* H-14 hint */}
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900 flex items-start gap-2">
            <Icon name="block" size={16} className="shrink-0 mt-0.5" />
            <div>
              <strong>These are hard blocks.</strong> Rule H-14 will reject any
              attempt to schedule this faculty member during a marked window.
              Use these for meetings, admin duties, or personal time that
              cannot be moved.
            </div>
          </div>

          {/* Overlap hint (H-14 + F-7) */}
          {overlapsPreferences.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-start gap-2">
              <Icon name="warning" size={16} className="shrink-0 mt-0.5" />
              <div>
                <strong>
                  {overlapsPreferences.length} unavailability block
                  {overlapsPreferences.length === 1 ? '' : 's'} overlap saved
                  preferences.
                </strong>{' '}
                Preferences are not deleted — they'll still emit F-7 warnings —
                but H-14 will reject any scheduling here, so those preferred
                windows become effectively unusable.
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
                lockedBlocks={lockedBlocks}
                contextBlocks={contextBlocks}
                variant="unavailable"
                disabled={saving}
              />
            )}
          </div>

          {/* Collapsible advanced section */}
          <div className="rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition rounded-lg"
            >
              <span className="flex items-center gap-2">
                <Icon
                  name={showAdvanced ? 'expand_less' : 'expand_more'}
                  size={16}
                />
                Reason &amp; saved blocks
                {sortedExisting.length > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {sortedExisting.length}
                  </span>
                )}
              </span>
            </button>

            {showAdvanced && (
              <div className="px-3 pb-3 space-y-3 border-t border-slate-200 pt-3">
                {/* Reason input */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                    Reason for new blocks (optional)
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Admin meeting, Research, Medical"
                    maxLength={300}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  />
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[10px] text-slate-400">
                      Applied to every block added in this session.
                    </p>
                    <span
                      className={`text-[10px] font-mono ${
                        reason.length > 280
                          ? 'text-amber-600'
                          : 'text-slate-400'
                      }`}
                    >
                      {reason.length}/300
                    </span>
                  </div>
                </div>

                {/* Existing blocks summary (read-only) */}
                {sortedExisting.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Currently on file
                      </p>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                        {sortedExisting.length}
                      </span>
                    </div>
                    <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                      {sortedExisting.map((u) => {
                        const stillInDraft = gridHas(draftBlocks, {
                          day: u.dayOfWeek,
                          startMin: toMinutes(u.startTime),
                          endMin: toMinutes(u.endTime),
                        });
                        return (
                          <li
                            key={u.unavailabilityId}
                            className={`flex items-center gap-3 px-3 py-2 bg-white ${
                              u.source === 'local' && !stillInDraft
                                ? 'opacity-50'
                                : ''
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-sm font-medium text-slate-900 ${
                                  u.source === 'local' && !stillInDraft
                                    ? 'line-through'
                                    : ''
                                }`}
                              >
                                {DAY_SHORT[u.dayOfWeek]}{' '}
                                {fmtTime(toMinutes(u.startTime))} –{' '}
                                {fmtTime(toMinutes(u.endTime))}
                              </p>
                              {u.reason && (
                                <p className="text-xs text-slate-500 mt-0.5 truncate">
                                  {u.reason}
                                </p>
                              )}
                            </div>

                            {u.source === 'idp' ? (
                              <span
                                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-800"
                                title="Synced from IDP — cannot be edited here"
                              >
                                IDP
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                Local
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : (
                  <div className="py-4 text-center border border-dashed border-slate-200 rounded-lg">
                    <Icon
                      name="event_available"
                      size={28}
                      className="text-slate-300 mx-auto mb-1"
                    />
                    <p className="text-xs text-slate-500">
                      No unavailability blocks yet.
                    </p>
                  </div>
                )}
              </div>
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
              {diff.preserved > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-700">
                  <Icon name="lock" size={12} />
                  {diff.preserved} IDP-preserved
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