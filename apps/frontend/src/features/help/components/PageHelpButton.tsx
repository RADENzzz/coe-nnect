import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Icon from '../../../components/ui/Icon';
import { useAuthStore } from '../../../store/auth.store';
import { useTutorialStore } from '../../../store/tutorial.store';
import { getTourForPath } from '../../tutorial/tours';

const OFFER_KEY_PREFIX = 'coe-nnect:tour-offered:';
const OFFER_CHANGED_EVENT = 'coe-nnect:tour-offered-changed';

function wasOffered(tourId: string): boolean {
  try {
    return localStorage.getItem(`${OFFER_KEY_PREFIX}${tourId}`) !== null;
  } catch {
    return false;
  }
}

function markOffered(tourId: string): void {
  try {
    localStorage.setItem(`${OFFER_KEY_PREFIX}${tourId}`, '1');
  } catch {
    /* Storage may be unavailable in private mode. */
  }
  // Both responsive header instances stay mounted; keep their offers in sync.
  window.dispatchEvent(new Event(OFFER_CHANGED_EVENT));
}

export default function PageHelpButton() {
  const location = useLocation();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.profile?.role);
  const startTour = useTutorialStore((s) => s.startTour);
  const activeTourId = useTutorialStore((s) => s.activeTourId);
  const pendingTourId = useTutorialStore((s) => s.pendingTourId);
  const welcomeOpen = useTutorialStore((s) => s.welcomeOpen);

  const [open, setOpen] = useState(false);
  const [offerVisible, setOfferVisible] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const tour = getTourForPath(location.pathname, role);

  // Close on outside click + Escape, matching the notification bell pattern.
  useEffect(() => {
    if (!open) return;

    const onDown = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // One short offer per tour, on arrival at its page. The welcome dialog and
  // an active or queued tour always take precedence.
  const refreshOffer = useCallback(() => {
    setOfferVisible(
      !!tour &&
        !!tour.paths?.length &&
        tour.steps.length <= 5 &&
        !activeTourId &&
        !pendingTourId &&
        !welcomeOpen &&
        !open &&
        location.pathname !== '/' &&
        !wasOffered(tour.id),
    );
  }, [tour, location.pathname, activeTourId, pendingTourId, welcomeOpen, open]);

  useEffect(() => {
    refreshOffer();
  }, [refreshOffer]);

  useEffect(() => {
    window.addEventListener(OFFER_CHANGED_EVENT, refreshOffer);
    return () => window.removeEventListener(OFFER_CHANGED_EVENT, refreshOffer);
  }, [refreshOffer]);

  const beginTour = (id: string) => {
    markOffered(id);
    setOfferVisible(false);
    setOpen(false);
    startTour(id);
  };

  const dismissOffer = () => {
    if (!tour) return;
    markOffered(tour.id);
    setOfferVisible(false);
  };

  const navigateTo = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="tap-target hover:bg-surface-container transition-colors flex items-center justify-center text-slate-500 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        aria-label="Page help"
        title="Help for this page"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Icon name="help" />
      </button>

      {offerVisible && tour && (
        <div
          role="region"
          aria-label="Page tour offer"
          className="absolute right-0 z-50 mt-2 w-[260px] max-w-[calc(100vw-1.5rem)] animate-fade-in rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
        >
          <div className="flex items-start gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon name="help" size={16} />
            </span>
            <p className="flex-1 text-xs leading-relaxed text-slate-700">
              New here? Take a 30-second tour of this page.
            </p>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={dismissOffer}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={() => beginTour(tour.id)}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-opacity hover:opacity-90"
            >
              Start
            </button>
          </div>
        </div>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Page help"
          className="absolute right-0 z-50 mt-2 w-[230px] max-w-[calc(100vw-1.5rem)] animate-fade-in overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
        >
          <button
            type="button"
            disabled={!tour}
            onClick={() => tour && beginTour(tour.id)}
            className="flex w-full items-start gap-2.5 px-3 py-2.5 text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
          >
            <Icon name="play_circle" size={16} className="mt-0.5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold">
                Take a tour of this page
              </span>
              {!tour && (
                <span className="mt-0.5 block text-[10px] text-slate-500">
                  No tour for this page yet
                </span>
              )}
            </span>
          </button>
          <button
            type="button"
            onClick={() => navigateTo('/help')}
            className="flex w-full items-center gap-2.5 border-t border-slate-100 px-3 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Icon name="menu_book" size={16} className="shrink-0 text-primary" />
            Open the Help page
          </button>
          <button
            type="button"
            onClick={() => navigateTo('/help#version')}
            className="flex w-full items-center gap-2.5 border-t border-slate-100 px-3 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Icon name="history" size={16} className="shrink-0 text-primary" />
            What's new
          </button>
        </div>
      )}
    </div>
  );
}
