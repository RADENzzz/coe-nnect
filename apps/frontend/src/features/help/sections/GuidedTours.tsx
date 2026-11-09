import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Icon from '../../../components/ui/Icon';
import { useTutorialStore } from '../../../store/tutorial.store';
import {
  getRecommendedTours,
  getTourMeta,
  getTourStartPath,
  tourMatchesPath,
  TOUR_CATEGORY_LABELS,
  type Tour,
} from '../../tutorial/tours';
import type { Role } from '../../../lib/constants/roles';

interface Props {
  role: Role | null;
}

/**
 * Role-aware list of guided tours, with progress and one-click launching.
 * Starting a tour for another page navigates there first.
 */
export function GuidedTours({ role }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const completed = useTutorialStore((s) => s.completed);
  const markOnboarded = useTutorialStore((s) => s.markOnboarded);
  const startTour = useTutorialStore((s) => s.startTour);
  const queueTour = useTutorialStore((s) => s.queueTour);
  const openGuides = useTutorialStore((s) => s.openGuides);
  const [query, setQuery] = useState('');

  const tours = useMemo(() => getRecommendedTours(role), [role]);
  const completedCount = tours.filter((tour) => completed[tour.id]).length;
  const progressPct =
    tours.length > 0 ? Math.round((completedCount / tours.length) * 100) : 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tours;
    return tours.filter((tour) => {
      const meta = getTourMeta(tour);
      return (
        tour.title.toLowerCase().includes(q) ||
        tour.description.toLowerCase().includes(q) ||
        TOUR_CATEGORY_LABELS[meta.category].toLowerCase().includes(q)
      );
    });
  }, [tours, query]);

  const begin = (tour: Tour) => {
    markOnboarded();
    const path = getTourStartPath(tour, location.pathname);
    if (
      path &&
      path !== location.pathname &&
      !tourMatchesPath(tour, location.pathname)
    ) {
      queueTour(tour.id);
      navigate(path);
      return;
    }
    startTour(tour.id);
  };

  if (!role) {
    return (
      <div>
        <h2 className="mb-4 text-xl font-semibold text-on-surface">
          Guided Tours
        </h2>
        <div className="border border-outline-variant bg-surface-container-lowest p-6 text-sm text-on-surface-variant">
          Sign in to see the guided tours for your role.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-on-surface">
            Guided Tours
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
            Short walkthroughs that point at the controls on each page. Progress
            is saved in this browser.
          </p>
        </div>
        <button
          type="button"
          onClick={openGuides}
          className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container"
        >
          <Icon name="menu_book" size={15} />
          Open guide library
        </button>
      </div>

      <div className="mb-5 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-on-surface-variant">
            <span className="font-bold text-on-surface">{completedCount}</span>{' '}
            of {tours.length} tours completed
          </p>
          <span className="text-[11px] font-bold uppercase tracking-wide text-primary">
            {progressPct}%
          </span>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-surface-container"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Tour completion"
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <label className="relative mb-4 block max-w-md">
        <Icon
          name="search"
          size={17}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tours…"
          aria-label="Search guided tours"
          className="h-10 w-full rounded-lg border border-outline-variant bg-surface pl-10 pr-3 text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((tour) => {
          const meta = getTourMeta(tour);
          const done = !!completed[tour.id];
          return (
            <div
              key={tour.id}
              className="group flex flex-col justify-between rounded-xl border border-outline-variant bg-surface p-4 transition-colors hover:border-primary/40"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon name={tour.icon} size={17} />
                    </span>
                    <h3 className="text-sm font-semibold text-on-surface">
                      {tour.title}
                    </h3>
                  </div>
                  {done && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
                      <Icon name="check" size={10} />
                      Done
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">
                  {tour.description}
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-outline-variant/60 pt-3">
                <span className="text-[10px] font-medium uppercase tracking-wide text-on-surface-variant">
                  {TOUR_CATEGORY_LABELS[meta.category]} · {tour.steps.length}{' '}
                  steps · ~{meta.minutes} min
                </span>
                <button
                  type="button"
                  onClick={() => begin(tour)}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-on-primary transition-opacity hover:opacity-90"
                >
                  <Icon name="play_arrow" size={13} />
                  {done ? 'Replay' : 'Start'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="border border-dashed border-outline-variant p-8 text-center text-sm text-on-surface-variant">
          No tours match “{query}”.
        </div>
      )}
    </div>
  );
}
