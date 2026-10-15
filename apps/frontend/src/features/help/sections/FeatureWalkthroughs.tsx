import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GifCard } from '../components/GifCard';
import { WALKTHROUGHS } from '../data/walkthroughs';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'scheduling', label: 'Scheduling' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'admin', label: 'Admin' },
  { id: 'reports', label: 'Reports' },
] as const;

export function FeatureWalkthroughs() {
  const [category, setCategory] =
    useState<(typeof CATEGORIES)[number]['id']>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    let list =
      category === 'all'
        ? WALKTHROUGHS
        : WALKTHROUGHS.filter((w) => w.category === category);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((w) => w.title.toLowerCase().includes(q));
    return list;
  }, [category, query]);

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-slate-900">
        Feature Walkthroughs
      </h2>
      <p className="mb-6 text-sm leading-relaxed text-slate-700">
        Short animated walkthroughs for each major feature. Click a category to
        filter, or scroll through them all.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {CATEGORIES.map((c) => {
          const active = category === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={
                'relative border px-3 py-1.5 text-xs font-medium transition-colors ' +
                (active
                  ? 'border-brand-700 bg-brand-700 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')
              }
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div className="relative mb-6 max-w-md">
        <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
          search
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search walkthroughs…"
          className="input pl-10"
          aria-label="Search walkthroughs"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="animate__animated animate__fadeIn border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
          No walkthroughs match your filter.
        </div>
      ) : (
        <motion.div layout className="grid gap-6 md:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {filtered.map((w) => (
              <motion.div
                key={w.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.32, ease: [0.2, 0.9, 0.3, 1] }}
              >
                <GifCard
                  title={w.title}
                  gif={w.gif}
                  steps={w.steps}
                  duration={w.duration}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}