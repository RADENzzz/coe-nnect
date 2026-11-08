import Icon from '../../../components/ui/Icon';

type Accent = 'brand' | 'blue' | 'amber' | 'rose' | 'emerald';
type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'brand' | 'rose';

const BADGE: Record<BadgeVariant, string> = {
  neutral: 'bg-slate-100 text-slate-600 border-slate-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger:  'bg-red-50 text-red-700 border-red-200',
  brand:   'bg-red-50 text-red-800 border-red-200',
  rose:    'bg-rose-50 text-rose-700 border-rose-200',
};

const ICON_ACCENT: Record<Accent, { bg: string; border: string; text: string }> = {
  brand:   { bg: 'bg-[#5c1219]/5', border: 'border-[#5c1219]/20', text: 'text-[#5c1219]' },
  blue:    { bg: 'bg-blue-50',     border: 'border-blue-200',     text: 'text-blue-700' },
  amber:   { bg: 'bg-amber-50',    border: 'border-amber-200',    text: 'text-amber-700' },
  rose:    { bg: 'bg-rose-50',     border: 'border-rose-200',     text: 'text-rose-700' },
  emerald: { bg: 'bg-emerald-50',  border: 'border-emerald-200',  text: 'text-emerald-700' },
};

export default function SummaryCard({
  icon,
  badge,
  badgeVariant = 'neutral',
  label,
  value,
  footer,
  onClick,
  clickable,
  isLoading,
  accent = 'brand',
  hint,
}: {
  icon: string;
  badge?: string;
  badgeVariant?: BadgeVariant;
  label: string;
  value: string;
  footer?: React.ReactNode;
  onClick?: () => void;
  clickable?: boolean;
  isLoading?: boolean;
  accent?: Accent;
  hint?: string;
}) {
  const ia = ICON_ACCENT[accent];
  const Wrapper = clickable ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      disabled={!clickable}
      title={hint}
      aria-label={hint ?? label}
      className={
        'group bg-white border border-slate-200 p-5 shadow-sm transition-all duration-200 text-left w-full rounded-xl focus:outline-none ' +
        (clickable
          ? 'hover:border-[#5c1219]/30 hover:shadow-md hover:-translate-y-0.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#5c1219]/30'
          : 'hover:border-slate-300')
      }
    >
      <div className="flex justify-between items-start mb-4">
        <div
          className={`w-10 h-10 rounded-lg border ${ia.border} ${ia.bg} flex items-center justify-center ${ia.text} transition-transform duration-200 group-hover:scale-105`}
        >
          {isLoading ? (
            <Icon name="progress_activity" size={18} className="animate-spin" />
          ) : (
            <Icon name={icon} size={20} filled />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {badge && (
            <span
              className={`text-[10px] font-bold uppercase tracking-wider border px-2 py-1 rounded-md ${BADGE[badgeVariant]}`}
            >
              {badge}
            </span>
          )}
          {clickable && (
            <Icon
              name="chevron_right"
              size={16}
              className="text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all duration-200"
            />
          )}
        </div>
      </div>
      <p className="text-xs font-medium text-slate-500 mb-1.5">{label}</p>
      <div className="text-3xl font-extrabold text-slate-900 tracking-tight tabular-nums">
        {isLoading ? '—' : value}
      </div>
      {footer && <div className="mt-4">{footer}</div>}
    </Wrapper>
  );
}