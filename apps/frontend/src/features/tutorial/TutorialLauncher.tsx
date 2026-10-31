import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import { useAuthStore } from '../../store/auth.store';
import { useTutorialStore } from '../../store/tutorial.store';
import {
  getAvailableTours,
  getTourForPath,
  type Tour,
} from './tours';

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
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-on-surface">
            {tour.title}
          </span>
          {completed && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
              <Icon name="check" size={10} />
              Done
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-on-surface-variant">
          {tour.description}
        </span>
        <span className="mt-1 block text-[10px] font-medium text-on-surface-variant/80">
          {tour.steps.length} step{tour.steps.length === 1 ? '' : 's'}
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
  const markOnboarded = useTutorialStore((s) => s.markOnboarded);
  const resetProgress = useTutorialStore((s) => s.resetProgress);
  const completed = useTutorialStore((s) => s.completed);
  const [confirmReset, setConfirmReset] = useState(false);

  const isDevAccount = profile?.role === 'administrator';
  if (isDevAccount) return null;

  const role = profile?.role;
  const currentTour = getTourForPath(location.pathname, role);
  const allTours = getAvailableTours(role);
  const otherTours = allTours.filter((tour) => tour.id !== currentTour?.id);
  const completedCount = allTours.filter((tour) => completed[tour.id]).length;
  const helpPath = location.pathname.startsWith('/dean')
    ? '/dean/help'
    : '/help';

  const begin = (id: string) => {
    markOnboarded();
    startTour(id);
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
          description="Short, step-by-step tours of the controls on each page."
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
          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-low px-3 py-2.5">
            <p className="text-xs text-on-surface-variant">
              <span className="font-bold text-on-surface">
                {completedCount}
              </span>{' '}
              of {allTours.length} guides completed in this browser
            </p>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon name="school" size={16} />
            </span>
          </div>

          <section className="space-y-2">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              This page
            </h3>
            {currentTour ? (
              <TourRow
                tour={currentTour}
                completed={!!completed[currentTour.id]}
                highlighted
                onStart={() => begin(currentTour.id)}
              />
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
                    onStart={() => begin(tour.id)}
                  />
                ))}
              </div>
            </section>
          )}

          <p className="rounded-lg bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
            While a tour is open, use ← and → to move between steps and Esc to
            exit. The highlighted control is the one the step is describing.
          </p>
        </div>
        </Modal>,
        document.body
      )}
    </>
  );
}
