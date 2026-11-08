import Icon from '../../../components/ui/Icon';

export default function BreakdownEmpty({
  message,
  icon = 'inbox',
  actionLabel,
  onAction,
}: {
  message: string;
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="py-14 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-3">
        <Icon name={icon} size={28} className="text-slate-300" />
      </div>
      <p className="text-sm text-slate-500 font-medium">{message}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#5c1219] hover:underline bg-[#5c1219]/5 px-3 py-1.5 rounded-md hover:bg-[#5c1219]/10 transition-colors"
        >
          {actionLabel}
          <Icon name="arrow_forward" size={12} />
        </button>
      )}
    </div>
  );
}