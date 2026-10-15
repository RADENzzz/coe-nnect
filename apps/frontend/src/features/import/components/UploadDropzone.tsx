import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';

interface UploadDropzoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
  maxBytes?: number;
  progress?: number;
  /** Optional hint shown below the dropzone. */
  hint?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function UploadDropzone({
  onFile,
  disabled,
  maxBytes = 20 * 1024 * 1024,
  progress,
  hint,
}: UploadDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pastePending, setPastePending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | File[] | null) => {
      setError(null);
      const file = files?.[0];
      if (!file) return;

      // Accept PDF by MIME or by extension (some browsers don't set MIME
      // for dragged files from certain sources).
      const looksPdf =
        file.type === 'application/pdf' ||
        file.name.toLowerCase().endsWith('.pdf');

      if (!looksPdf) {
        setError('Only PDF files are accepted.');
        return;
      }
      if (file.size > maxBytes) {
        setError(
          `File is too large (${formatBytes(file.size)}). Max ${formatBytes(maxBytes)}.`,
        );
        return;
      }
      if (file.size === 0) {
        setError('File is empty.');
        return;
      }
      onFile(file);
    },
    [onFile, maxBytes],
  );

  // ── Clipboard paste support ──
  useEffect(() => {
    if (disabled) return;

    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      let pdfFile: File | null = null;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (!file) continue;
          const looksPdf =
            file.type === 'application/pdf' ||
            file.name.toLowerCase().endsWith('.pdf');
          if (looksPdf) {
            pdfFile = file;
            break;
          }
        }
      }

      if (pdfFile) {
        e.preventDefault();
        setPastePending(true);
        setTimeout(() => setPastePending(false), 400);
        handleFiles([pdfFile]);
      }
    };

    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [disabled, handleFiles]);

  const openPicker = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker();
    }
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload prospectus PDF"
        aria-disabled={disabled || undefined}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          handleFiles(e.dataTransfer.files);
        }}
        onClick={openPicker}
        onKeyDown={onKeyDown}
        className={`
          relative rounded-xl border-2 border-dashed p-8 text-center
          transition-all duration-200 outline-none
          focus-visible:ring-2 focus-visible:ring-primary/40
          ${
            dragOver
              ? 'border-primary bg-primary/5 scale-[1.01]'
              : 'border-surface-variant bg-surface-container-lowest hover:border-primary/60 hover:bg-surface-container-low'
          }
          ${pastePending ? 'ring-2 ring-emerald-400 ring-offset-2' : ''}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            // Reset so selecting the same file twice fires onChange.
            e.target.value = '';
          }}
          disabled={disabled}
        />

        <Icon
          name={
            pastePending
              ? 'content_paste_go'
              : dragOver
              ? 'file_download'
              : 'cloud_upload'
          }
          size={48}
          className={`mx-auto mb-3 transition-colors ${
            pastePending ? 'text-emerald-600' : 'text-primary'
          }`}
        />

        <p className="text-on-surface font-semibold mb-1">
          {pastePending
            ? 'Pasted from clipboard'
            : dragOver
            ? 'Drop the PDF here'
            : 'Drop a prospectus PDF here'}
        </p>
        <p className="text-on-surface-variant text-sm">
          or{' '}
          <span className="font-semibold text-primary underline">browse</span>{' '}
          — PDF only, max {formatBytes(maxBytes)}
        </p>

        <p className="text-[11px] text-on-surface-variant mt-3 flex items-center justify-center gap-1.5">
          <Icon name="content_paste" size={12} />
          You can also press{' '}
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono border border-slate-300 bg-slate-50 rounded">
            Ctrl/Cmd
          </kbd>
          {' + '}
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono border border-slate-300 bg-slate-50 rounded">
            V
          </kbd>
        </p>

        {typeof progress === 'number' && progress > 0 && progress < 100 && (
          <div className="mt-4 max-w-xs mx-auto">
            <div className="h-1.5 bg-surface-container-high rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-on-surface-variant mt-1.5 tabular-nums">
              Uploading… {progress}%
            </p>
          </div>
        )}
      </div>

      {hint && !error && (
        <p className="text-[11px] text-on-surface-variant mt-2 text-center">
          {hint}
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="mt-3 p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm flex items-start gap-2"
        >
          <Icon name="error" size={18} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-800"
            aria-label="Dismiss error"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}