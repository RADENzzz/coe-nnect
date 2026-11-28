import { useEffect, useState } from 'react';
import Modal from '../../../components/ui/Modal';

const COUNTS = [2, 3, 5] as const;

export interface AutoGenerateOptionsDialogProps {
  open: boolean;
  count: 2 | 3 | 5;
  onClose: () => void;
  onGenerate: (count: 2 | 3 | 5) => void;
}

export default function AutoGenerateOptionsDialog({
  open,
  count,
  onClose,
  onGenerate,
}: AutoGenerateOptionsDialogProps) {
  const [draftCount, setDraftCount] = useState<2 | 3 | 5>(count);

  useEffect(() => {
    if (open) setDraftCount(count);
  }, [count, open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate options"
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high rounded-lg transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onGenerate(draftCount)}
            className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary rounded-lg hover:bg-tertiary transition"
          >
            Generate
          </button>
        </>
      }
    >
      <fieldset>
        <legend>Number of schedule options to generate</legend>
        <div className="mt-3 flex flex-col gap-2">
          {COUNTS.map((option) => (
            <label
              key={option}
              className="flex items-center gap-2 text-sm text-on-surface cursor-pointer"
            >
              <input
                type="radio"
                name="candidate-count"
                value={option}
                checked={draftCount === option}
                onChange={() => setDraftCount(option)}
                className="accent-primary"
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>
    </Modal>
  );
}
