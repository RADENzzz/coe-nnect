export default function StatusRow({
  label,
  count,
  total,
  barColor,
}: {
  label: string;
  count: number;
  total: number;
  barColor: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="text-slate-500">
          <span className="font-bold text-slate-900 tabular-nums">{count}</span>
          {' · '}
          <span className="tabular-nums">{pct}%</span>
        </span>
      </div>
      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
        <div
          className={`${barColor} h-2 transition-all duration-300 rounded-full`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}