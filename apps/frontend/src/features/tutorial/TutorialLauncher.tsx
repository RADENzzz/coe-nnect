import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import { useAuthStore } from '../../store/auth.store';
import { useTutorialStore } from '../../store/tutorial.store';
import {
  getRecommendedTours,
  getTourForPath,
  getTourMeta,
  getTourStartPath,
  tourMatchesPath,
  TOUR_CATEGORY_LABELS,
  type Tour,
  type TourCategory,
} from './tours';

const CATEGORY_ORDER: TourCategory[] = [
  'essentials',
  'setup',
  'scheduling',
  'workflow',
  'reports',
  'admin',
  'account',
];

function TourRow({
  tour,
  completed,
  highlighted,
  onStart,
}: {
  tour: Tour;
  completed: boolean;
  highlighted?: boolean;
  onStart: () => void;
}) {
  const meta = getTourMeta(tour);

  return (
    <button
      type="button"
      onClick={onStart}
      className={`group flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
        highlighted
          ? 'border-primary/40 bg-primary/[0.05] hover:bg-primary/[0.09]'
          : 'border-outline-variant bg-surface hover:bg-surface-container-low'
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon name={tour.icon} size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-semibold text-on-surface">
            {tour.title}
          </span>
          {completed ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
              <Icon name="check" size={10} />
              Done
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-surface-container px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-on-surface-variant">
              {TOUR_CATEGORY_LABELS[meta.category]}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-on-surface-variant">
          {tour.description}
        </span>
        <span className="mt-1 flex items-center gap-2 text-[10px] font-medium text-on-surface-variant/80">
          <span>
            {tour.steps.length} step{tour.steps.length === 1 ? '' : 's'}
          </span>
          <span aria-hidden>·</span>
          <span>~{meta.minutes} min</span>
        </span>
      </span>
      <Icon
        name="play_circle"
        size={20}
        className="mt-0.5 shrink-0 text-on-surface-variant transition-colors group-hover:text-primary"
      />
    </button>
  );
}

export default function TutorialLauncher() {
  const location = useLocation();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const guidesOpen = useTutorialStore((s) => s.guidesOpen);
  const openGuides = useTutorialStore((s) => s.openGuides);
  const closeGuides = useTutorialStore((s) => s.closeGuides);
  const startTour = useTutorialStore((s) => s.startTour);
  const queueTour = useTutorialStore((s) => s.queueTour);
  const markOnboarded = useTutorialStore((s) => s.markOnboarded);
  const resetProgress = useTutorialStore((s) => s.resetProgress);
  const completed = useTutorialStore((s) => s.completed);
  const [confirmReset, setConfirmReset] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | TourCategory>('all');

  const isDevAccount = profile?.role === 'administrator';
  const role = profile?.role;
  const currentTour = getTourForPath(location.pathname, role);
  const allTours = useMemo(() => getRecommendedTours(role), [role]);
  const completedCount = allTours.filter((tour) => completed[tour.id]).length;
  const progressPct =
    allTours.length > 0
      ? Math.round((completedCount / allTours.length) * 100)
      : 0;
  const recommended =
    allTours.find(
      (tour) => !completed[tour.id] && tour.id !== currentTour?.id,
    ) ?? allTours.find((tour) => !completed[tour.id]);
  const helpPath = location.pathname.startsWith('/dean')
    ? '/dean/help'
    : '/help';

  const categories = useMemo(() => {
    const present = new Set<TourCategory>();
    for (const tour of allTours) present.add(getTourMeta(tour).category);
    return CATEGORY_ORDER.filter((item) => present.has(item));
  }, [allTours]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allTours.filter((tour) => {
      const meta = getTourMeta(tour);
      if (category !== 'all' && meta.category !== category) return false;
      if (!q) return true;
      return (
        tour.title.toLowerCase().includes(q) ||
        tour.description.toLowerCase().includes(q) ||
        TOUR_CATEGORY_LABELS[meta.category].toLowerCase().includes(q) ||
        tour.steps.some((step) => step.title.toLowerCase().includes(q))
      );
    });
  }, [allTours, category, query]);

  if (isDevAccount) return null;

  const otherTours = filtered.filter((tour) => tour.id !== currentTour?.id);
  const currentMatchesFilter =
    currentTour != null &&
    filtered.some((tour) => tour.id === currentTour.id);

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

  return (
    <>
      <button
        type="button"
        data-tour="tutorial-help"
        onClick={openGuides}
        className="tap-target hover:bg-surface-container transition-colors flex items-center justify-center text-slate-500 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        aria-label="Tutorials and guides"
        title="Tutorials and guides"
      >
        <Icon name="help" />
      </button>

      {/* The dialog must not live inside the TopBar: under the glass theme
          the header gets a backdrop-filter, which makes it the positioning
          parent for any `fixed` descendant — pinning this dialog to the top
          of the screen instead of centring it. Portal to <body> so it is
          always viewport-centred. */}
      {createPortal(
        <Modal
          open={guidesOpen}
          onClose={() => {
            setConfirmReset(false);
            closeGuides();
          }}
          title="Tutorials & guides"
          description="Short, step-by-step tours that follow the page you are on."
          size="lg"
          footer={
            <>
              {confirmReset ? (
                <>
                  <span className="mr-auto text-xs text-on-surface-variant">
                    Reset every guide and welcome?
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmReset(false);
                      resetProgress();
                    }}
                    className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    Yes, reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(true)}
                    className="mr-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                  >
                    <Icon name="restart_alt" size={15} />
                    Reset progress
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      closeGuides();
                      navigate(helpPath);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container"
                  >
                    <Icon name="menu_book" size={16} />
                    Help center
                  </button>
                  <button
                    type="button"
                    onClick={closeGuides}
                    className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-opacity hover:opacity-90"
                  >
                    Close
                  </button>
                </>
              )}
            </>
          }
        >
          <div className="space-y-5">
            {/* Progress */}
            <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-on-surface-variant">
                  <span className="font-bold text-on-surface">
                    {completedCount}
                  </span>{' '}
                  of {allTours.length} guides completed in this browser
                </p>
                <span className="text-[11px] font-bold uppercase tracking-wide text-primary">
                  {progressPct}%
                </span>
              </div>
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-container"
                role="progressbar"
                aria-valuenow={progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Guide completion"
              >
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {recommended && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                      Recommended next
                    </p>
                    <p className="truncate text-xs font-semibold text-on-surface">
                      {recommended.title}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => begin(recommended)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-on-primary transition-opacity hover:opacity-90"
                  >
                    <Icon name="play_arrow" size={13} />
                    Start
                  </button>
                </div>
              )}
            </div>

            {/* Search + categories */}
            <div className="relative">
              <Icon
                name="search"
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search guides and steps…"
                aria-label="Search guides"
                className="h-10 w-full rounded-lg border border-outline-variant bg-surface pl-10 pr-3 text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
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
                    {item === 'all' ? 'All' : TOUR_CATEGORY_LABELS[item]}
                  </button>
                );
              })}
            </div>

            {/* This page */}
            <section className="space-y-2">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                This page
              </h3>
              {currentTour && currentMatchesFilter ? (
                <TourRow
                  tour={currentTour}
                  completed={!!completed[currentTour.id]}
                  highlighted
                  onStart={() => begin(currentTour)}
                />
              ) : currentTour ? (
                <div className="rounded-xl border border-dashed border-outline-variant px-4 py-5 text-center text-xs text-on-surface-variant">
                  The guide for this page is hidden by your current filter.
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-outline-variant px-4 py-5 text-center text-xs text-on-surface-variant">
                  No page-specific guide yet. Use the welcome tour for an
                  orientation, or open the Help center below.
                </div>
              )}
            </section>

            {otherTours.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  All guides for your role
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {otherTours.map((tour) => (
                    <TourRow
                      key={tour.id}
                      tour={tour}
                      completed={!!completed[tour.id]}
                      onStart={() => begin(tour)}
                    />
                  ))}
                </div>
              </section>
            )}

            {filtered.length === 0 && (
              <div className="rounded-xl border border-dashed border-outline-variant px-4 py-8 text-center text-sm text-on-surface-variant">
                No guides match “{query}”.
              </div>
            )}

            <p className="rounded-lg bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
              While a tour is open, use ← and → to move between steps and Esc to
              exit. Starting a guide for another page will take you there
              automatically.
            </p>
          </div>
        </Modal>,
        document.body,
      )}
    </>
  );
}
