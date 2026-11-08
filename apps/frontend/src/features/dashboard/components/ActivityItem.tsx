import Icon from '../../../components/ui/Icon';

export default function ActivityItem({
  icon,
  iconBg,
  iconColor,
  text,
  time,
  actionLabel,
  onAction,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  text: React.ReactNode;
  time: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="px-5 py-3.5 flex items-center gap-3.5 hover:bg-slate-50/80 transition-colors group">
      <div className={`w-9 h-9 flex items-center justify-center shrink-0 ${iconBg} ${iconColor} rounded-lg`}>
        <Icon name={icon} size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-800 truncate leading-snug">{text}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
          <Icon name="schedule" size={10} />
          {time}
        </p>
      </div>
      <button
        onClick={onAction}
        className="text-[#5c1219] text-xs font-semibold hover:underline shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]/30 rounded-md px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
      >
        {actionLabel}
      </button>
    </div>
  );
}