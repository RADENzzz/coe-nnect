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

type Category = (typeof CATEGORIES)[number]['id'];

export function FeatureWalkthroughs() {
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    let list =
      category === 'all'
        ? WALKTHROUGHS
        : WALKTHROUGHS.filter((walkthrough) => walkthrough.category === category);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (walkthrough) =>
          walkthrough.title.toLowerCase().includes(q) ||
          walkthrough.steps.some((step) => step.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [category, query]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-on-surface">
            Feature Walkthroughs
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
            Short, visual guides for each major feature. Cards show an animated
            preview when a recording is not available.
          </p>
        </div>
        <span className="rounded-full border border-outline-variant bg-surface px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant">
          {filtered.length} of {WALKTHROUGHS.length}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {CATEGORIES.map((item) => {
          const active = category === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setCategory(item.id)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                active
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-outline-variant bg-surface text-on-surface-variant hover:border-primary/40 hover:text-primary'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <label className="relative mb-6 block max-w-md">
        <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
          search
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search walkthroughs and steps…"
          className="h-10 w-full rounded-lg border border-outline-variant bg-surface pl-10 pr-3 text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
          aria-label="Search walkthroughs"
        />
      </label>

      {filtered.length === 0 ? (
        <div className="border border-dashed border-outline-variant p-8 text-center text-sm text-on-surface-variant">
          No walkthroughs match your filter.
        </div>
      ) : (
        <motion.div layout className="grid gap-6 md:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {filtered.map((walkthrough) => (
              <motion.div
                key={walkthrough.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.32, ease: [0.2, 0.9, 0.3, 1] }}
              >
                <GifCard
                  title={walkthrough.title}
                  gif={walkthrough.gif}
                  steps={walkthrough.steps}
                  duration={walkthrough.duration}
                  category={walkthrough.category}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
