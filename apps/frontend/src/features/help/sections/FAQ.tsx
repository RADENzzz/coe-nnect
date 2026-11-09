import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { FAQ as FAQ_ITEMS, type Faq } from '../data/faq';
import { AccordionItem } from '../components/animations';

type FaqCategory = NonNullable<Faq['category']>;

const CATEGORY_LABELS: Record<FaqCategory, string> = {
  general: 'General',
  scheduling: 'Scheduling',
  import: 'Import',
  workflow: 'Workflow',
  technical: 'Technical',
};

const CATEGORY_ORDER: FaqCategory[] = [
  'general',
  'scheduling',
  'workflow',
  'import',
  'technical',
];

export function FAQ() {
  const [open, setOpen] = useState<string | null>(FAQ_ITEMS[0]?.q ?? null);
  const [allOpen, setAllOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | FaqCategory>('all');

  const categories = useMemo(() => {
    const present = new Set(
      FAQ_ITEMS.map((item) => item.category ?? 'general'),
    );
    return CATEGORY_ORDER.filter((item) => present.has(item));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQ_ITEMS.filter((item) => {
      if (category !== 'all' && (item.category ?? 'general') !== category) {
        return false;
      }
      if (!q) return true;
      return (
        item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)
      );
    });
  }, [category, query]);

  const openSet = useMemo(() => {
    if (allOpen) return new Set(filtered.map((item) => item.q));
    return new Set(open == null ? [] : [open]);
  }, [allOpen, filtered, open]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-on-surface">
            Frequently Asked Questions
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
            Quick answers to common questions, grouped by topic.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAllOpen((value) => !value);
            setOpen(null);
          }}
          className="text-xs font-medium text-primary hover:underline"
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      <label className="relative mb-3 block max-w-md">
        <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
          search
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search questions and answers…"
          aria-label="Search frequently asked questions"
          className="h-10 w-full rounded-lg border border-outline-variant bg-surface pl-10 pr-3 text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
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
              {item === 'all' ? 'All' : CATEGORY_LABELS[item]}
            </button>
          );
        })}
      </div>

      <div className="divide-y divide-outline-variant border border-outline-variant bg-surface">
        {filtered.map((item, i) => (
          <motion.div
            key={item.q}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.35, delay: i * 0.03 }}
          >
            <AccordionItem
              open={openSet.has(item.q)}
              onToggle={() => {
                setAllOpen(false);
                setOpen(openSet.has(item.q) ? null : item.q);
              }}
              header={
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-on-surface">
                    {item.q}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
                    {CATEGORY_LABELS[item.category ?? 'general']}
                  </span>
                </span>
              }
            >
              <div className="text-sm leading-relaxed text-on-surface-variant">
                {item.a}
              </div>
            </AccordionItem>
          </motion.div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="border border-dashed border-outline-variant p-8 text-center text-sm text-on-surface-variant">
          No questions match “{query}”.
        </div>
      )}
    </div>
  );
}
