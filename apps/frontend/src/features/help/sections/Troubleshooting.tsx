import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { AccordionItem } from '../components/animations';
import {
  TROUBLESHOOTING,
  TROUBLESHOOTING_CATEGORY_LABELS,
  type TroubleshootingCategory,
} from '../data/troubleshooting';

const CATEGORY_ORDER: TroubleshootingCategory[] = [
  'scheduling',
  'rooms',
  'access',
  'workflow',
  'import',
  'realtime',
];

export function Troubleshooting() {
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | TroubleshootingCategory>(
    'all',
  );

  const categories = useMemo(() => {
    const present = new Set(TROUBLESHOOTING.map((item) => item.category));
    return CATEGORY_ORDER.filter((item) => present.has(item));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TROUBLESHOOTING.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!q) return true;
      return (
        item.issue.toLowerCase().includes(q) ||
        item.fix.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.checks ?? []).some((check) => check.toLowerCase().includes(q))
      );
    });
  }, [category, query]);

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-on-surface">
        Troubleshooting
      </h2>
      <p className="mb-6 text-sm leading-relaxed text-on-surface-variant">
        Common issues and how to resolve them. Start with the checks listed
        under each fix.
      </p>

      <label className="relative mb-3 block max-w-md">
        <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
          search
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search issues…"
          className="h-10 w-full rounded-lg border border-outline-variant bg-surface pl-10 pr-3 text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
          aria-label="Search troubleshooting"
        />
      </label>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {(['all', ...categories] as const).map((item) => {
          const active = category === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                active
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-outline-variant bg-surface text-on-surface-variant hover:border-primary/40 hover:text-primary'
              }`}
            >
              {item === 'all'
                ? 'All'
                : TROUBLESHOOTING_CATEGORY_LABELS[item]}
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {filtered.map((item, i) => (
          <motion.div
            key={item.issue}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4, delay: i * 0.04 }}
            className={`group border bg-surface transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${
              item.severity === 'warning'
                ? 'border-outline-variant hover:border-amber-300'
                : 'border-outline-variant hover:border-primary/40'
            }`}
          >
            <AccordionItem
              open={open === item.issue}
              onToggle={() =>
                setOpen(open === item.issue ? null : item.issue)
              }
              header={
                <div className="flex items-start gap-2">
                  <span
                    className={`material-symbols-outlined mt-0.5 text-[18px] transition-transform duration-200 group-hover:scale-110 ${
                      item.severity === 'warning'
                        ? 'text-amber-500'
                        : 'text-primary'
                    }`}
                  >
                    {item.severity === 'warning' ? 'warning' : 'info'}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-on-surface">
                      {item.issue}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
                      {TROUBLESHOOTING_CATEGORY_LABELS[item.category]}
                    </span>
                  </span>
                </div>
              }
            >
              <div className="pl-7">
                <p className="text-sm leading-relaxed text-on-surface">
                  {item.fix}
                </p>
                {item.checks && item.checks.length > 0 && (
                  <ol className="mt-2 space-y-1 text-xs leading-relaxed text-on-surface-variant">
                    {item.checks.map((check, index) => (
                      <li key={check} className="flex gap-2">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
                          {index + 1}
                        </span>
                        {check}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </AccordionItem>
          </motion.div>
        ))}

        {filtered.length === 0 && (
          <div className="border border-dashed border-outline-variant p-8 text-center text-sm text-on-surface-variant">
            No issues match “{query}”.
          </div>
        )}
      </div>
    </div>
  );
}
