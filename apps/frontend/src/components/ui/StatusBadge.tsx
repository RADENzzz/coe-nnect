import clsx from 'clsx';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'purple';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  danger:  'bg-red-100 text-red-700',
  info:    'bg-blue-100 text-blue-700',
  brand:   'bg-red-50 text-red-800',
  purple:  'bg-purple-100 text-purple-700',
};

interface StatusBadgeProps {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}

export default function StatusBadge({
  children,
  tone = 'neutral',
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center text-[11px] px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Common case: Active / Inactive status pill.
 * Used by every admin list page.
 */
export function ActiveBadge({ isActive }: { isActive: boolean }) {
  return (
    <StatusBadge tone={isActive ? 'success' : 'danger'}>
      {isActive ? 'Active' : 'Inactive'}
    </StatusBadge>
  );
}