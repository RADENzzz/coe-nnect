import { useEffect, useState } from 'react';
import Modal from '../../../components/ui/Modal';
import Icon from '../../../components/ui/Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Suggested filename without extension. */
  defaultStem: string;
  /** 'pdf' | 'xlsx' */
  extension: string;
  /** Called with the final filename (with extension). */
  onConfirm: (filename: string) => void;
}

export default function ExportFilenameModal({
  open,
  onClose,
  defaultStem,
  extension,
  onConfirm,
}: Props) {
  const [value, setValue] = useState(defaultStem);

  // Reset to suggested name each time the modal opens
  useEffect(() => {
    if (open) setValue(defaultStem);
  }, [open, defaultStem]);

  const trimmed = value.trim();
  const invalid =
    trimmed.length === 0 ||
    /[\\/:*?"<>|]/.test(trimmed) ||
    trimmed.length > 120;

  const handleConfirm = () => {
    if (invalid) return;
    const stem = trimmed.replace(new RegExp(`\\.${extension}$`, 'i'), '');
    onConfirm(`${stem}.${extension}`);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save export"
      description={`File name for the .${extension} export`}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={invalid}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-primary text-on-primary hover:bg-tertiary transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon name="download" size={16} />
            Save
          </button>
        </>
      }
    >
      <label className="block">
        <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
          File name
        </span>
        <div className="flex items-stretch border border-slate-300 focus-within:border-slate-500 focus-within:ring-1 focus-within:ring-[#5c1219]">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
            }}
            autoFocus
            className="flex-1 px-3 py-2 text-sm outline-none bg-white"
          />
          <span className="flex items-center px-3 text-sm text-slate-500 bg-slate-50 border-l border-slate-200 tabular-nums">
            .{extension}
          </span>
        </div>
        {invalid && trimmed.length > 0 && (
          <p className="text-xs text-red-600 mt-1.5">
            Remove any of these characters: \ / : * ? " &lt; &gt; |
          </p>
        )}
        {invalid && trimmed.length === 0 && (
          <p className="text-xs text-red-600 mt-1.5">
            File name cannot be empty.
          </p>
        )}
      </label>
    </Modal>
  );
}