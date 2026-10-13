import { useState } from 'react';
import { GifCard } from '../components/GifCard';
import { WALKTHROUGHS } from '../data/walkthroughs';

const CATEGORIES = [
  { id: 'all',              label: 'All' },
  { id: 'getting-started',  label: 'Getting Started' },
  { id: 'scheduling',       label: 'Scheduling' },
  { id: 'workflow',         label: 'Workflow' },
  { id: 'admin',            label: 'Admin' },
  { id: 'reports',          label: 'Reports' },
] as const;

export function FeatureWalkthroughs() {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['id']>('all');

  const filtered =
    category === 'all'
      ? WALKTHROUGHS
      : WALKTHROUGHS.filter((w) => w.category === category);

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-slate-900">Feature Walkthroughs</h2>
      <p className="mb-6 text-sm leading-relaxed text-slate-700">
        Short animated walkthroughs for each major feature. Click a category to
        filter, or scroll through them all.
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={
              'border px-3 py-1.5 text-xs font-medium transition-colors ' +
              (category === c.id
                ? 'border-brand-700 bg-brand-700 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
          No walkthroughs in this category yet.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {filtered.map((w) => (
            <GifCard
              key={w.id}
              title={w.title}
              gif={w.gif}
              steps={w.steps}
              duration={w.duration}
            />
          ))}
        </div>
      )}
    </div>
  );
}