import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import Modal from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  busy?: boolean;
  requireText?: string;
  onConfirm: () => void;
  onClose: () => void;
}

interface ConfirmationState {
  open: boolean;
  requireText?: string;
  value: string;
}

/** Standard yes/no confirmation. Cancel is the default-focused action. */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'default',
  busy = false,
  requireText,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmationInputId = useId();
  const [confirmation, setConfirmation] = useState<ConfirmationState>({
    open,
    requireText,
    value: '',
  });

  useEffect(() => {
    setConfirmation({ open, requireText, value: '' });
  }, [open, requireText]);

  // Comparing the remembered prompt and open state as well as the value keeps
  // confirm disabled on renders where the dialog reopens or the prompt changes,
  // before the reset effect runs.
  const confirmationMatches =
    requireText !== undefined &&
    confirmation.open === open &&
    confirmation.requireText === requireText &&
    confirmation.value.trim() === requireText;
  const confirmDisabled =
    busy || (requireText !== undefined && !confirmationMatches);

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
            disabled={confirmDisabled}
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
      <div className="space-y-4">
        <div className="text-sm text-slate-600">{description}</div>
        {requireText !== undefined && (
          <div>
            <label
              htmlFor={confirmationInputId}
              className="block text-xs font-semibold text-on-surface-variant mb-1.5"
            >
              {`Type "${requireText}" to confirm`}
            </label>
            <input
              id={confirmationInputId}
              type="text"
              value={confirmation.value}
              onChange={(event) =>
                setConfirmation((previous) => ({
                  ...previous,
                  value: event.target.value,
                }))
              }
              disabled={busy}
              autoComplete="off"
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
