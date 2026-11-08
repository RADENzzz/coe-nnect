export default function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600 border-slate-200',
    review: 'bg-amber-50 text-amber-700 border-amber-200',
    finalized: 'bg-blue-50 text-blue-700 border-blue-200',
    published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span
      className={`text-[9px] uppercase tracking-wider font-bold border px-1.5 py-0.5 rounded ${
        map[status] ?? map.draft
      }`}
    >
      {status}
    </span>
  );
}