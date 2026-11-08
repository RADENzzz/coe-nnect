import type { ReactNode } from 'react';

interface Props {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}

export default function FormField({ label, required, hint, error, children }: Props) {
  return (
    <div>
      <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
        {label}
        {required && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-[11px] text-red-600 mt-1 flex items-start gap-1">
          <span className="shrink-0">⚠</span> {error}
        </p>
      ) : hint ? (
        <div className="text-[10px] text-on-surface-variant mt-1 leading-tight">{hint}</div>
      ) : null}
    </div>
  );
}