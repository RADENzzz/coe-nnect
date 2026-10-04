interface StatsCardProps {
  label: string;
  value: number | string;
  icon: string;
  loading?: boolean;
}

export default function StatsCard({ label, value, icon, loading }: StatsCardProps) {
  return (
    <div className="bg-white border border-slate-200 p-5 flex items-center gap-4 shadow-sm">
      <div className="w-9 h-9 bg-red-50 border border-red-200 flex items-center justify-center">
        <span className="material-symbols-outlined text-[#5c1219] text-lg">{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-extrabold text-slate-900 tracking-tight">
          {loading ? '—' : value}
        </p>
        <p className="text-sm text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}