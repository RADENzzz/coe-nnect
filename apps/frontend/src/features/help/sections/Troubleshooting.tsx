import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { AccordionItem } from '../components/animations';

const ITEMS = [
  {
    issue: "A class block won't stay where I drop it.",
    fix: 'The system validates every move against hard constraints. If a conflict exists (faculty overlap, room overlap, section overlap, operating hours), the block snaps back. Check the red banner for which rule is blocking.',
    severity: 'warning' as const,
  },
  {
    issue: 'Auto-generate says "not enough rooms".',
    fix: 'Room sufficiency is checked before the solver runs. Add more rooms of the required type, or reduce the number of sections taking that subject. The system tells you exactly which room type is short and by how many hours.',
    severity: 'warning' as const,
  },
  {
    issue: "I can't edit a schedule entry — it says locked.",
    fix: 'Finalized and published entries are locked. Change the status back to Draft or Review first, then edit.',
    severity: 'info' as const,
  },
  {
    issue: 'The prospectus PDF parser returns 404 or 500.',
    fix: 'The parser service may be down. Check the /health endpoint on the parser, and verify PROSPECTUS_PARSER_URL is set correctly on the backend.',
    severity: 'warning' as const,
  },
  {
    issue: "Notifications aren't arriving.",
    fix: 'WebSocket connection may have dropped. Refresh the page. If the issue persists, check that the backend is running with the socket gateway loaded.',
    severity: 'warning' as const,
  },
  {
    issue: 'Auto-generate is blocked by another run.',
    fix: 'The system allows only one auto-generate per term at a time. If a previous run was interrupted, the lock will self-heal after 10 minutes. Or click Abandon to release it immediately.',
    severity: 'info' as const,
  },
];

export function Troubleshooting() {
  const [open, setOpen] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ITEMS;
    return ITEMS.filter(
      (i) =>
        i.issue.toLowerCase().includes(q) || i.fix.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-slate-900">
        Troubleshooting
      </h2>
      <p className="mb-6 text-sm leading-relaxed text-slate-700">
        Common issues and how to resolve them.
      </p>

      <div className="relative mb-4 max-w-md">
        <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
          search
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search issues…"
          className="input pl-10"
          aria-label="Search troubleshooting"
        />
      </div>

      <div className="space-y-3">
        {filtered.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4, delay: i * 0.04 }}
            className={
              'group border bg-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ' +
              (item.severity === 'warning'
                ? 'border-slate-200 hover:border-amber-300'
                : 'border-slate-200 hover:border-brand-300')
            }
          >
            <AccordionItem
              open={open === i}
              onToggle={() => setOpen(open === i ? null : i)}
              header={
                <div className="flex items-start gap-2">
                  <span
                    className={
                      'material-symbols-outlined mt-0.5 text-[18px] transition-transform duration-200 group-hover:scale-110 ' +
                      (item.severity === 'warning'
                        ? 'text-amber-600'
                        : 'text-brand-700')
                    }
                  >
                    {item.severity === 'warning' ? 'warning' : 'info'}
                  </span>
                  <span className="text-sm font-semibold text-slate-900">
                    {item.issue}
                  </span>
                </div>
              }
            >
              <div className="pl-7 text-sm leading-relaxed text-slate-700">
                {item.fix}
              </div>
            </AccordionItem>
          </motion.div>
        ))}

        {filtered.length === 0 && (
          <div className="animate__animated animate__fadeIn border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
            No issues match “{query}”.
          </div>
        )}
      </div>
    </div>
  );
}