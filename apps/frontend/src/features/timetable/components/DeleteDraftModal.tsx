import { useRef } from 'react';

import type { DraftSnapshotSummary } from '../../../api/schedule.api';
import Modal from '../../../components/ui/Modal';

interface DeleteDraftModalProps {
  open: boolean;
  snapshot: DraftSnapshotSummary | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/** In-app confirmation for deleting a saved snapshot only. */
export default function DeleteDraftModal({
  open,
  snapshot,
  busy,
  onClose,
  onConfirm,
}: DeleteDraftModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal
      open={open && !!snapshot}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Delete saved draft?"
      size="sm"
      busy={busy}
      initialFocusRef={cancelRef}
      footer={
        <>
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !snapshot}
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-semibold bg-rose-700 text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Deleting…' : 'Delete saved draft'}
          </button>
        </>
      }
    >
      <p className="text-sm text-on-surface">
        Delete <strong>{snapshot?.name}</strong>?
      </p>
      <p className="mt-2 text-xs text-on-surface-variant">
        This cannot be undone. The saved rows are removed; live timetable rows,
        faculty requests, approvals, and publish state are not changed.
      </p>
    </Modal>
  );
}
