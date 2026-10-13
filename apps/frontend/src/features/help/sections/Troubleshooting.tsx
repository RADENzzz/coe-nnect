const ITEMS = [
  {
    issue: "A class block won't stay where I drop it.",
    fix: 'The system validates every move against hard constraints. If a conflict exists (faculty overlap, room overlap, section overlap, operating hours), the block snaps back. Check the red banner for which rule is blocking.',
  },
  {
    issue: 'Auto-generate says "not enough rooms".',
    fix: 'Room sufficiency is checked before the solver runs. Add more rooms of the required type, or reduce the number of sections taking that subject. The system tells you exactly which room type is short and by how many hours.',
  },
  {
    issue: "I can't edit a schedule entry — it says locked.",
    fix: 'Finalized and published entries are locked. Change the status back to Draft or Review first, then edit.',
  },
  {
    issue: 'The prospectus PDF parser returns 404 or 500.',
    fix: 'The parser service may be down. Check the /health endpoint on the parser, and verify PROSPECTUS_PARSER_URL is set correctly on the backend.',
  },
  {
    issue: "Notifications aren't arriving.",
    fix: 'WebSocket connection may have dropped. Refresh the page. If the issue persists, check that the backend is running with the socket gateway loaded.',
  },
  {
    issue: 'Auto-generate is blocked by another run.',
    fix: 'The system allows only one auto-generate per term at a time. If a previous run was interrupted, the lock will self-heal after 10 minutes. Or click Abandon to release it immediately.',
  },
];

export function Troubleshooting() {
  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-slate-900">
        Troubleshooting
      </h2>
      <p className="mb-6 text-sm leading-relaxed text-slate-700">
        Common issues and how to resolve them.
      </p>

      <div className="space-y-3">
        {ITEMS.map((item, i) => (
          <div
            key={i}
            className="animate-fade-up group border border-slate-200 bg-white p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md"
            style={{
              animationDelay: `${i * 60}ms`,
              animationFillMode: 'both',
            }}
          >
            <div className="mb-2 flex items-start gap-2">
              <span className="material-symbols-outlined mt-0.5 text-[18px] text-amber-600 transition-transform duration-200 group-hover:scale-110">
                warning
              </span>
              <div className="text-sm font-semibold text-slate-900">
                {item.issue}
              </div>
            </div>
            <div className="pl-7 text-sm leading-relaxed text-slate-700">
              {item.fix}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}