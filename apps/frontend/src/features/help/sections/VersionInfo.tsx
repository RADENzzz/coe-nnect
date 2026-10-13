import { ABOUT } from '../data/team';

export function VersionInfo() {
  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-slate-900">Version Info</h2>
      <p className="mb-6 text-sm leading-relaxed text-slate-700">
        Current build details for CoE-NNECT.
      </p>

      <div className="animate-fade-up border border-slate-200 bg-white">
        <Row label="Product" value={ABOUT.product} index={0} />
        <Row label="Full name" value={ABOUT.fullName} index={1} />
        <Row label="Institution" value={ABOUT.institution} index={2} />
        <Row label="Version" value={ABOUT.version} index={3} />
        <Row label="Build date" value={ABOUT.buildDate} index={4} />
        <Row label="Description" value={ABOUT.description} last index={5} />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  last,
  index = 0,
}: {
  label: string;
  value: string;
  last?: boolean;
  index?: number;
}) {
  return (
    <div
      className={
        'grid grid-cols-1 gap-1 px-4 py-3 transition-colors hover:bg-slate-50 md:grid-cols-[160px_1fr] md:gap-4 ' +
        (last ? '' : 'border-b border-slate-100')
      }
      style={{
        animationDelay: `${index * 40}ms`,
        animationFillMode: 'both',
      }}
    >
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="text-sm text-slate-800">{value}</div>
    </div>
  );
}