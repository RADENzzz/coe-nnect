import { useCallback, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';

interface UploadDropzoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
  maxBytes?: number;
  progress?: number;
}

export default function UploadDropzone({
  onFile,
  disabled,
  maxBytes = 20 * 1024 * 1024,
  progress,
}: UploadDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      setError(null);
      const file = files?.[0];
      if (!file) return;
      if (file.type !== 'application/pdf') {
        setError('Only PDF files are accepted.');
        return;
      }
      if (file.size > maxBytes) {
        setError(
          `File is too large. Max ${Math.round(maxBytes / 1024 / 1024)}MB.`,
        );
        return;
      }
      onFile(file);
    },
    [onFile, maxBytes],
  );

  return (
    <div>
      <div
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
        onClick={() => !disabled && inputRef.current?.click()}
        className={`
          relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer
          transition-all duration-200
          ${dragOver
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-surface-variant bg-surface-container-lowest hover:border-primary/60 hover:bg-surface-container-low'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={disabled}
        />

        <Icon
          name={dragOver ? 'file_download' : 'cloud_upload'}
          size={48}
          className="text-primary mx-auto mb-3"
        />

        <p className="text-on-surface font-semibold mb-1">
          {dragOver ? 'Drop the PDF here' : 'Drop a prospectus PDF here'}
        </p>
        <p className="text-on-surface-variant text-sm">
          or click to browse — PDF only, max{' '}
          {Math.round(maxBytes / 1024 / 1024)}MB
        </p>

        {typeof progress === 'number' && progress > 0 && progress < 100 && (
          <div className="mt-4 max-w-xs mx-auto">
            <div className="h-1.5 bg-surface-container-high rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-on-surface-variant mt-1.5">
              Uploading… {progress}%
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm flex items-start gap-2">
          <Icon name="error" size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}