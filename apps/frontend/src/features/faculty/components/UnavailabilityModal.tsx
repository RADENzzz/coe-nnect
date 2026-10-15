import { useEffect, useMemo, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchFacultyUnavailability,
  addFacultyUnavailability,
  removeFacultyUnavailability,
  type FacultyUnavailability,
  type FullDayName,
} from '../../../api/faculty-unavailability.api';
import type { FacultyRecord } from '../../../api/faculty.api';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import UnavailabilityGrid, { type GridBlock } from './UnavailabilityGrid';

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

export default function UnavailabilityModal({
  open,
  onClose,
  faculty,
  termId,
}: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [draftBlocks, setDraftBlocks] = useState<GridBlock[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [confirmClose, setConfirmClose] = useState(false);
  const [savingPhase, setSavingPhase] = useState<'idle' | 'removing' | 'adding' | 'done'>('idle');

  // ── Load existing ──
  const { data: existing = [], isLoading } = useQuery({
    queryKey: ['faculty-unavailability', faculty?.facultyId, termId],
    queryFn: () => fetchFacultyUnavailability(faculty!.facultyId, termId),
    enabled: open && !!faculty,
  });

  const visibleExisting = useMemo(
    () => existing.filter((u) => !removedIds.has(u.unavailabilityId)),
    [existing, removedIds],
  );

  // Rebuild on open / term change
  useEffect(() => {
    if (!open) return;
    setDraftBlocks(
      visibleExisting.map((u) => ({
        day: u.dayOfWeek,
        startMin: toMinutes(u.startTime),
        endMin: toMinutes(u.endTime),
      })),
    );
    setRemovedIds(new Set());
    setReason('');
    setError(null);
    setSavingPhase('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, termId]);

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

  // ── Compute diff for confirmation ──
  const diff = useMemo(() => {
    const localExisting = existing.filter((u) => u.source === 'local');
    const idpBlocks = existing.filter((u) => u.source === 'idp');
    const idpAsGrid: GridBlock[] = idpBlocks.map((u) => ({
      day: u.dayOfWeek,
      startMin: toMinutes(u.startTime),
      endMin: toMinutes(u.endTime),
    }));
    const draftOnly = draftBlocks.filter(
      (b) =>
        !idpAsGrid.some(
          (i) =>
            i.day === b.day &&
            i.startMin === b.startMin &&
            i.endMin === b.endMin,
        ),
    );
    return {
      removed: localExisting.length,
      added: draftOnly.length,
      preserved: idpBlocks.length,
      draftOnly,
    };
  }, [existing, draftBlocks]);

  const hasChanges = diff.removed > 0 || diff.added > 0;

  // ── Save ──
  const handleSave = async () => {
    setError(null);

    const localExisting = existing.filter((u) => u.source === 'local');
    const idpBlocks = existing.filter((u) => u.source === 'idp');
    const idpAsGrid: GridBlock[] = idpBlocks.map((u) => ({
      day: u.dayOfWeek,
      startMin: toMinutes(u.startTime),
      endMin: toMinutes(u.endTime),
    }));

    const draftOnly = draftBlocks.filter(
      (b) =>
        !idpAsGrid.some(
          (i) =>
            i.day === b.day &&
            i.startMin === b.startMin &&
            i.endMin === b.endMin,
        ),
    );

    const errors: string[] = [];

    try {
      // Phase 1: remove
      if (localExisting.length > 0) {
        setSavingPhase('removing');
        const results = await Promise.allSettled(
          localExisting.map((u) =>
            removeMutation.mutateAsync(u.unavailabilityId),
          ),
        );
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            errors.push(
              `Failed to remove ${localExisting[i].dayOfWeek} ${localExisting[i].startTime}: ${
                (r.reason as any)?.response?.data?.message ??
                (r.reason as any)?.message ??
                'unknown error'
              }`,
            );
          }
        });
      }

      // Phase 2: add
      if (draftOnly.length > 0) {
        setSavingPhase('adding');
        const results = await Promise.allSettled(
          draftOnly.map((b) =>
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
              `Failed to add ${draftOnly[i].day} ${toHHMM(draftOnly[i].startMin)}: ${
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
        return;
      }

      setSavingPhase('done');
      qc.invalidateQueries({ queryKey: ['faculty-unavailability'] });
      onClose();
    } catch (err) {
      setError(
        (err as any)?.response?.data?.message ??
          (err as any)?.message ??
          'Save failed',
      );
      setSavingPhase('idle');
    }
  };

  const handleRequestClose = useCallback(() => {
    if (hasChanges && !saving) {
      setConfirmClose(true);
    } else {
      onClose();
    }
  }, [hasChanges, saving, onClose]);

  const handleRemoveExisting = (u: FacultyUnavailability) => {
    if (u.source === 'idp') {
      setError(
        'IDP-sourced blocks cannot be removed here. They are managed by the IDP system.',
      );
      return;
    }
    setRemovedIds((prev) => new Set(prev).add(u.unavailabilityId));
    setDraftBlocks((prev) =>
      prev.filter(
        (b) =>
          !(
            b.day === u.dayOfWeek &&
            b.startMin === toMinutes(u.startTime) &&
            b.endMin === toMinutes(u.endTime)
          ),
      ),
    );
  };

  const sortedExisting = useMemo(() => {
    return [...visibleExisting].sort((a, b) => {
      const da = DAY_ORDER.indexOf(a.dayOfWeek);
      const db = DAY_ORDER.indexOf(b.dayOfWeek);
      if (da !== db) return da - db;
      return a.startTime.localeCompare(b.startTime);
    });
  }, [visibleExisting]);

  const draftSummary = useMemo(() => {
    return draftBlocks.filter((b) => b.endMin > b.startMin).length;
  }, [draftBlocks]);

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
            <button
              type="button"
              onClick={handleRequestClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition disabled:opacity-50 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || isLoading || !hasChanges}
              className="px-4 py-2 text-sm font-semibold bg-[#5c1219] text-white hover:opacity-90 transition disabled:opacity-50 rounded-lg flex items-center gap-2"
            >
              {saving && <Icon name="progress_activity" size={14} className="animate-spin" />}
              {saving
                ? savingPhase === 'removing'
                  ? 'Removing old blocks…'
                  : 'Adding new blocks…'
                : hasChanges
                ? `Save ${diff.added} add / ${diff.removed} remove`
                : 'No changes'}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          {error && (
            <div className="p-3 bg-red-100 border border-red-300 text-red-700 text-xs rounded-lg flex items-start gap-2 whitespace-pre-line">
              <Icon name="error" size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
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
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#5c1219] focus:ring-2 focus:ring-[#5c1219]/10"
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-slate-400">
                Applied to every block added in this session. Existing blocks
                keep their own reason.
              </p>
              <span
                className={`text-[10px] font-mono ${
                  reason.length > 280 ? 'text-amber-600' : 'text-slate-400'
                }`}
              >
                {reason.length}/300
              </span>
            </div>
          </div>

          {/* Grid */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Weekly Grid
            </p>
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
              <UnavailabilityGrid
                blocks={draftBlocks}
                onChange={setDraftBlocks}
                disabled={saving}
              />
            )}
          </div>

          {/* Change summary */}
          {hasChanges && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 flex items-center gap-3 flex-wrap">
              <span className="font-semibold text-slate-700">Pending changes:</span>
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

          {/* Existing blocks list */}
          {sortedExisting.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Declared Blocks
                </p>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                  {sortedExisting.length}
                </span>
              </div>
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {sortedExisting.map((u) => (
                  <li
                    key={u.unavailabilityId}
                    className="flex items-center gap-3 px-3 py-2.5 bg-white"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {DAY_SHORT[u.dayOfWeek]} {fmtTime(toMinutes(u.startTime))}{' '}
                        – {fmtTime(toMinutes(u.endTime))}
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

                    <button
                      type="button"
                      onClick={() => handleRemoveExisting(u)}
                      disabled={u.source === 'idp'}
                      className="p-1 text-slate-400 hover:text-rose-600 transition disabled:opacity-30 disabled:cursor-not-allowed"
                      title={
                        u.source === 'idp'
                          ? 'IDP blocks cannot be removed here'
                          : 'Remove this block'
                      }
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && sortedExisting.length === 0 && draftBlocks.length === 0 && (
            <div className="py-6 text-center border border-dashed border-slate-200 rounded-lg">
              <Icon
                name="event_available"
                size={32}
                className="text-slate-300 mx-auto mb-2"
              />
              <p className="text-sm text-slate-500">
                No unavailability blocks yet.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Drag on the grid above to mark a window, or use a preset button.
              </p>
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
          You have {diff.added} pending addition{diff.added === 1 ? '' : 's'} and{' '}
          {diff.removed} pending removal{diff.removed === 1 ? '' : 's'} that
          haven't been saved. If you close now, these changes will be lost.
        </p>
      </Modal>
    </>
  );
}