import Icon from '../../../components/ui/Icon';

type Accent = 'default' | 'amber' | 'rose';

const BADGE_ACCENT: Record<Accent, string> = {
  default: 'bg-surface-container text-on-surface-variant',
  amber: 'bg-amber-100 text-amber-800',
  rose: 'bg-rose-100 text-rose-800',
};

/**
 * Slim quick-action chip. Keeps the dashboard's action row to one line on
 * desktop and two on mobile instead of a six-tile grid.
 */
export default function QuickAction({
  icon,
  label,
  onClick,
  badge,
  variant = 'default',
  accent = 'default',
}: {
  icon: string;
  label: string;
  onClick: () => void;
  badge?: number;
  variant?: 'default' | 'primary';
  accent?: Accent;
}) {
  const isPrimary = variant === 'primary';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
        isPrimary
          ? 'border-primary bg-primary text-on-primary hover:opacity-90'
          : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-container-low'
      }`}
    >
      <Icon name={icon} size={14} className="shrink-0" />
      {label}
      {badge !== undefined && badge > 0 && (
        <span
          className={`ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums ${
            isPrimary
              ? 'bg-on-primary/20 text-on-primary'
              : BADGE_ACCENT[accent]
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
