import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  fetchDraftSnapshot,
  type DraftSnapshotSummary,
  type VersionSource,
} from '../../../api/schedule.api';
import { useFeedback } from '../../../components/ui/FeedbackToast';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import { extractApiError } from '../../../lib/api-error';
import { versionEntryToEntry } from '../utils/version-entry.mapper';
import TimetableGrid from './TimetableGrid';

interface DraftPreviewModalProps {
  open: boolean;
  onClose: () => void;
  onCompareWithLive: (source: VersionSource) => void;
  snapshot: DraftSnapshotSummary | null;
  termId: string;
  deptId: string;
  termLabel: string;
}

/** Read-only view of the draft/review rows captured in a saved draft. */
export default function DraftPreviewModal({
  open,
  onClose,
  onCompareWithLive,
  snapshot,
  termId,
  deptId,
  termLabel,
}: DraftPreviewModalProps) {
  const feedback = useFeedback();
  const canLoad =
    open && !!snapshot && !!termId.trim() && !!deptId.trim();

  const { data, isLoading, error } = useQuery({
    queryKey: [
      'draft-snapshot-preview',
      snapshot?.snapshotId,
      termId,
      deptId,
    ],
    queryFn: () =>
      fetchDraftSnapshot(snapshot!.snapshotId, termId, deptId),
    enabled: canLoad,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (error) {
      feedback.failed(
        extractApiError(error, 'Could not load the saved draft rows.'),
      );
    }
  }, [error, feedback]);

  const entries = useMemo(
    () => (data ? data.entries.map((raw) => versionEntryToEntry(raw)) : []),
    [data],
  );
  const readOnlyEntryIds = useMemo(
    () => new Set(entries.map((entry) => entry.id)),
    [entries],
  );

  return (
    <Modal
      open={open && !!snapshot}
      onClose={onClose}
      title="Saved draft preview"
      description={snapshot?.name}
      size="full"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            Close
          </button>
          <button
            type="button"
            disabled={!snapshot || !termId.trim()}
            onClick={() =>
              onCompareWithLive({ kind: 'live', id: termId })
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-primary text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="compare_arrows" size={14} />
            Compare with live
          </button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant">
        <span>{termLabel}</span>
        <span>{data?.entryCount ?? snapshot?.entryCount ?? 0} rows</span>
      </div>

      {isLoading && (
        <p className="mb-3 text-sm text-on-surface-variant">
          Loading saved rows…
        </p>
      )}

      {data && entries.length === 0 && (
        <p className="mb-3 border border-dashed border-outline-variant px-4 py-3 text-sm text-on-surface-variant">
          No draft or review rows in this saved draft
        </p>
      )}

      <section
        aria-label="Saved draft rows"
        className="flex h-[min(55vh,28rem)] min-h-[18rem] flex-col overflow-hidden border border-surface-variant"
      >
        <div className="min-h-0 flex-1">
          <TimetableGrid
            entries={entries}
            density="fit"
            fitToContainer
            readOnlyEntryIds={readOnlyEntryIds}
          />
        </div>
      </section>
    </Modal>
  );
}
