import { useRef, type ReactNode } from 'react';
import clsx from 'clsx';
import Modal from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Standard yes/no confirmation. Cancel is the default-focused action. */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'default',
  busy = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      busy={busy}
      hideCloseButton
      initialFocusRef={cancelRef}
      footer={
        <>
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={clsx(
              'px-4 py-2 text-sm font-semibold text-white transition rounded-lg disabled:opacity-50 disabled:cursor-not-allowed',
              tone === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-primary hover:opacity-90',
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-slate-600">{description}</div>
    </Modal>
  );
}
