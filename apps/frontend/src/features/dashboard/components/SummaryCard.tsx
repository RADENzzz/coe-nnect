import Icon from '../../../components/ui/Icon';
import RollingValue from '../../../components/ui/RollingValue';

type Tone = 'default' | 'success' | 'warning' | 'danger';

const VALUE_TONE: Record<Tone, string> = {
  default: 'text-on-surface',
  success: 'text-emerald-700',
  warning: 'text-amber-700',
  danger: 'text-rose-700',
};

const DOT_TONE: Record<Tone, string> = {
  default: 'bg-transparent',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
};

/**
 * Minimal dashboard metric.
 *
 * Designed to sit inside a divided grid — no icon tile, no badge chrome,
 * just a label, the number, and one line of context. The value takes a
 * status tone only when something actually needs attention.
 */
export default function SummaryCard({
  icon,
  label,
  value,
  hint,
  tone = 'default',
  isLoading,
  onClick,
}: {
  icon: string;
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
  isLoading?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="flex w-full items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
        <Icon name={icon} size={12} className="shrink-0" />
        <span className="truncate">{label}</span>
        {tone !== 'default' && (
          <span
            className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full ${DOT_TONE[tone]}`}
            aria-hidden="true"
          />
        )}
      </span>
      <span
        className={`text-[22px] font-bold leading-none tracking-tight tabular-nums ${VALUE_TONE[tone]}`}
      >
        <RollingValue value={value} loading={isLoading} />
      </span>
      {hint && (
        <span className="text-[11px] leading-snug text-on-surface-variant">
          <RollingValue
            value={hint}
            loading={isLoading}
            loadingLength={Math.min(18, hint.length)}
          />
        </span>
      )}
    </>
  );

  const className =
    'group flex min-w-0 flex-col items-start gap-1 bg-surface px-4 py-3.5 text-left';

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${className} cursor-pointer transition-colors hover:bg-surface-container-low focus:outline-none focus-visible:bg-surface-container-low focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30`}
      >
        {body}
      </button>
    );
  }

  return <div className={className}>{body}</div>;
}
