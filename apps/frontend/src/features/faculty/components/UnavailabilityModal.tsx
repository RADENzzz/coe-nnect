import { useEffect, useMemo, useState } from 'react';
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
  /** Optional current term — new blocks are scoped to this term. */
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

/** "HH:MM:SS" or "HH:MM" → minutes since midnight. */
function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** minutes since midnight → "HH:MM". */
function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "HH:MM" → "8:00 AM". */
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

  // Rebuild the grid when the modal opens or the term changes.
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
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? err.message ?? 'Add failed'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      removeFacultyUnavailability(faculty!.facultyId, id),
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? err.message ?? 'Remove failed'),
  });

  const saving = addMutation.isPending || removeMutation.isPending;

  // ── Save handler: replace-all strategy ──
  const handleSave = async () => {
    setError(null);

    // 1. Remove every existing LOCAL row — regardless of whether it's
    //    hidden via `removedIds`.
    //
    //    FIX: use the raw `existing` array, not `visibleExisting`.
    //    `visibleExisting` filters out rows the user marked with the ✕
    //    button; if we computed the delete list from it, those rows
    //    would never be deleted from the backend — the deletion would
    //    silently fail to persist.
    const localExisting = existing.filter((u) => u.source === 'local');

    try {
      await Promise.all(
        localExisting.map((u) => removeMutation.mutateAsync(u.unavailabilityId)),
      );

      // 2. Re-add every draft block, except ones already covered by an
      //    IDP-synced row (those are preserved and not editable here).
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

      await Promise.all(
        draftOnly.map((b) =>
          addMutation.mutateAsync({
            dayOfWeek: b.day as FullDayName,
            startTime: toHHMM(b.startMin),
            endTime: toHHMM(b.endMin),
            reason: reason.trim() || undefined,
          }),
        ),
      );

      qc.invalidateQueries({ queryKey: ['faculty-unavailability'] });
      onClose();
    } catch (err) {
      // Individual mutation errors set `error` via onError
      // eslint-disable-next-line no-console
      console.error('Unavailability save failed:', err);
    }
  };

  // ── Undo a specific existing block ──
  const handleRemoveExisting = (u: FacultyUnavailability) => {
    if (u.source === 'idp') {
      setError(
        'IDP-sourced blocks cannot be removed here. They are managed by the IDP system.',
      );
      return;
    }
    setRemovedIds((prev) => new Set(prev).add(u.unavailabilityId));
    // Also remove from draftBlocks if it's a full-block removal.
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
    const valid = draftBlocks.filter((b) => b.endMin > b.startMin);
    return valid.length;
  }, [draftBlocks]);

  return (
    <Modal
      open={open && !!faculty}
      onClose={onClose}
      title="Faculty Unavailability"
      description={
        faculty ? `${faculty.lastName}, ${faculty.firstName}` : undefined
      }
      size="lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || isLoading}
            className="px-4 py-2 text-sm font-semibold bg-[#5c1219] text-white hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2"
          >
            <Icon name="save" size={16} />
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {error && (
          <div className="p-3 bg-red-100 border border-red-300 text-red-700 text-sm">
            {error}
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
            className="w-full bg-surface-container-low border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#5c1219]"
          />
          <p className="text-[10px] text-slate-400 mt-1">
            Applied to every block added in this session. Existing blocks
            keep their own reason.
          </p>
        </div>

        {/* Grid */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Weekly Grid
          </p>
          {isLoading ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Loading blocks…
            </div>
          ) : (
            <UnavailabilityGrid
              blocks={draftBlocks}
              onChange={setDraftBlocks}
            />
          )}
          <p className="text-[10px] text-slate-400 mt-2">
            {draftSummary} block{draftSummary === 1 ? '' : 's'} will be saved.
            Existing local blocks are replaced on save.
          </p>
        </div>

        {/* Existing blocks list */}
        {sortedExisting.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Declared Blocks
            </p>
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

                  {/* Source badge */}
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

                  {/* Remove button */}
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
              Drag on the grid above to mark a window.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}