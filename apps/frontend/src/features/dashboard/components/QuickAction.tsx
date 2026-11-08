import Icon from '../../../components/ui/Icon';

type Accent = 'brand' | 'blue' | 'amber' | 'rose' | 'emerald';

const ACCENTS: Record<
  Accent,
  { bg: string; text: string; hover: string; ring: string }
> = {
  brand:   { bg: 'bg-[#5c1219]/5',  text: 'text-[#5c1219]',  hover: 'hover:bg-[#5c1219]/10',  ring: 'focus-visible:ring-[#5c1219]/30' },
  blue:    { bg: 'bg-blue-50',      text: 'text-blue-700',   hover: 'hover:bg-blue-100',      ring: 'focus-visible:ring-blue-300' },
  amber:   { bg: 'bg-amber-50',     text: 'text-amber-700',  hover: 'hover:bg-amber-100',     ring: 'focus-visible:ring-amber-300' },
  rose:    { bg: 'bg-rose-50',      text: 'text-rose-700',   hover: 'hover:bg-rose-100',      ring: 'focus-visible:ring-rose-300' },
  emerald: { bg: 'bg-emerald-50',   text: 'text-emerald-700',hover: 'hover:bg-emerald-100',   ring: 'focus-visible:ring-emerald-300' },
};

export default function QuickAction({
  icon,
  label,
  onClick,
  badge,
  accent = 'brand',
}: {
  icon: string;
  label: string;
  onClick: () => void;
  badge?: string | number;
  accent?: Accent;
}) {
  const a = ACCENTS[accent];
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`relative ${a.bg} ${a.hover} border border-slate-200/80 p-4 flex flex-col items-center justify-center gap-2.5 transition-all duration-200 group focus:outline-none focus-visible:ring-2 ${a.ring} rounded-xl`}
    >
      <span
        className={`w-10 h-10 rounded-lg ${a.bg} ${a.text} flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}
      >
        <Icon name={icon} size={20} />
      </span>
      <span className="text-[11px] font-semibold text-slate-700 text-center leading-tight">
        {label}
      </span>
      {badge !== undefined && badge !== 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 rounded-full bg-[#5c1219] text-white text-[10px] font-bold flex items-center justify-center shadow-sm animate-pulse">
          {badge}
        </span>
      )}
    </button>
  );
}