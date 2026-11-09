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
    <div className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-container-low/60">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg} ${iconColor}`}
      >
        <Icon name={icon} size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-snug text-on-surface">{text}</p>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-on-surface-variant">
          <Icon name="schedule" size={10} />
          {time}
        </p>
      </div>
      <button
        onClick={onAction}
        className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/5 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        {actionLabel}
      </button>
    </div>
  );
}
