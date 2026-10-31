import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import { useAuthStore } from '../../store/auth.store';
import { useTutorialStore } from '../../store/tutorial.store';
import { getTour, WELCOME_TOUR_ID, type TourPlacement } from './tours';

const POPOVER_WIDTH = 360;
const SPOTLIGHT_PADDING = 7;
const VIEWPORT_MARGIN = 14;
const POPOVER_GAP = 14;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Position {
  left: number;
  top: number;
}

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(el);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
}

function findVisibleTarget(selector: string): HTMLElement | null {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(selector),
  );
  return nodes.find(isVisible) ?? null;
}

function measure(el: HTMLElement): Box {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function computePosition(
  target: Box | null,
  placement: TourPlacement | undefined,
  viewportWidth: number,
  viewportHeight: number,
  width: number,
  height: number,
): Position {
  if (!target) {
    return {
      left: Math.max(VIEWPORT_MARGIN, (viewportWidth - width) / 2),
      top: Math.max(VIEWPORT_MARGIN, (viewportHeight - height) / 2),
    };
  }

  const top = target.top - SPOTLIGHT_PADDING;
  const left = target.left - SPOTLIGHT_PADDING;
  const right = target.left + target.width + SPOTLIGHT_PADDING;
  const bottom = target.top + target.height + SPOTLIGHT_PADDING;

  const space = {
    top: top - VIEWPORT_MARGIN,
    bottom: viewportHeight - bottom - VIEWPORT_MARGIN,
    left: left - VIEWPORT_MARGIN,
    right: viewportWidth - right - VIEWPORT_MARGIN,
  };

  const centerX = clamp(
    left + (right - left) / 2 - width / 2,
    VIEWPORT_MARGIN,
    viewportWidth - width - VIEWPORT_MARGIN,
  );
  const centerY = clamp(
    top + (bottom - top) / 2 - height / 2,
    VIEWPORT_MARGIN,
    viewportHeight - height - VIEWPORT_MARGIN,
  );

  const at = (side: TourPlacement): Position => {
    switch (side) {
      case 'top':
        return { left: centerX, top: top - height - POPOVER_GAP };
      case 'bottom':
        return { left: centerX, top: bottom + POPOVER_GAP };
      case 'left':
        return { left: left - width - POPOVER_GAP, top: centerY };
      case 'right':
        return { left: right + POPOVER_GAP, top: centerY };
      default:
        return { left: centerX, top: centerY };
    }
  };

  const fits = (side: TourPlacement): boolean => {
    if (side === 'top') return space.top >= height + POPOVER_GAP;
    if (side === 'bottom') return space.bottom >= height + POPOVER_GAP;
    if (side === 'left') return space.left >= width + POPOVER_GAP;
    if (side === 'right') return space.right >= width + POPOVER_GAP;
    return true;
  };

  const preferred =
    placement && placement !== 'auto' && placement !== 'center'
      ? placement
      : null;

  if (preferred && fits(preferred)) return at(preferred);

  // A requested side did not fit — try the opposite, then the cross axis.
  const fallbackOrder: TourPlacement[] = (() => {
    switch (preferred) {
      case 'top':
        return ['bottom', 'right', 'left'];
      case 'bottom':
        return ['top', 'right', 'left'];
      case 'left':
        return ['right', 'bottom', 'top'];
      case 'right':
        return ['left', 'bottom', 'top'];
      default:
        return ['bottom', 'right', 'top', 'left'];
    }
  })();

  for (const side of fallbackOrder) {
    if (fits(side)) return at(side);
  }

  return { left: centerX, top: centerY };
}

function WelcomeDialog() {
  const profile = useAuthStore((s) => s.profile);
  const welcomeOpen = useTutorialStore((s) => s.welcomeOpen);
  const dismissWelcome = useTutorialStore((s) => s.dismissWelcome);
  const markOnboarded = useTutorialStore((s) => s.markOnboarded);
  const startTour = useTutorialStore((s) => s.startTour);

  const name = profile?.first_name || profile?.username || 'there';

  return (
    <Modal
      open={welcomeOpen}
      onClose={dismissWelcome}
      title="Welcome to CoE-NNECT"
      description="A one-minute orientation to the controls you will use every day."
      size="lg"
      footer={
        <>
          <button
            type="button"
            onClick={dismissWelcome}
            className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
          >
            I'll explore on my own
          </button>
          <button
            type="button"
            onClick={() => {
              markOnboarded();
              startTour(WELCOME_TOUR_ID);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-opacity hover:opacity-90"
          >
            <Icon name="play_arrow" size={18} />
            Start the tour
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-on-surface">
          Hi {name} — this quick tour highlights the controls that matter.
          Each page also has its own guide, so you can learn the workflow one
          screen at a time.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              icon: 'menu',
              title: 'Navigation',
              body: 'The sidebar lists everything your role can open. On a phone it becomes the bottom bar.',
            },
            {
              icon: 'search',
              title: 'Global search',
              body: 'Find subjects, faculty, rooms, and sections. Press Ctrl+K (⌘K on Mac) anywhere.',
            },
            {
              icon: 'help',
              title: 'Help button',
              body: 'Open the guide library or replay a page tour whenever you need a reminder.',
            },
            {
              icon: 'palette',
              title: 'Make it yours',
              body: 'Change the theme, accent colour, background tone, and logo in Settings → Appearance.',
            },
          ].map((item) => (
            <div
              key={item.title}
              className="flex gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon name={item.icon} size={19} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-on-surface">
                  {item.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-on-surface-variant">
                  {item.body}
                </p>
              </div>
            </div>
          ))}
        </div>

        <p className="rounded-lg bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
          You can restart this welcome and every page guide from the Help
          button at the top of the screen.
        </p>
      </div>
    </Modal>
  );
}

export default function TutorialProvider() {
  const location = useLocation();
  const profile = useAuthStore((s) => s.profile);
  const onboardedAt = useTutorialStore((s) => s.onboardedAt);
  const activeTourId = useTutorialStore((s) => s.activeTourId);
  const stepIndex = useTutorialStore((s) => s.stepIndex);
  const openWelcome = useTutorialStore((s) => s.openWelcome);

  const tour = getTour(activeTourId);
  const step = tour?.steps[stepIndex];

  const [target, setTarget] = useState<Box | null>(null);
  const [popoverHeight, setPopoverHeight] = useState(260);
  const [viewport, setViewport] = useState(() =>
    typeof window === 'undefined'
      ? { width: 1280, height: 800 }
      : { width: window.innerWidth, height: window.innerHeight },
  );

  const popoverRef = useRef<HTMLDivElement>(null);
  const startedPathRef = useRef<string | null>(null);
  const titleId = useId();

  // A tour belongs to the page it was started from. Navigating away ends it
  // instead of leaving a spotlight pointing at a control that no longer exists.
  useEffect(() => {
    if (!activeTourId) {
      startedPathRef.current = null;
      return;
    }
    if (startedPathRef.current === null) {
      startedPathRef.current = location.pathname;
      return;
    }
    if (startedPathRef.current !== location.pathname) {
      useTutorialStore.getState().closeTour();
    }
  }, [activeTourId, location.pathname]);

  // First run in this browser: offer onboarding automatically. Hidden dev
  // accounts and legacy viewers never see it.
  useEffect(() => {
    if (!profile) return;
    if (profile.role !== 'college_dean' && profile.role !== 'department_head') {
      return;
    }
    if (onboardedAt) return;
    if (useTutorialStore.getState().activeTourId) return;
    openWelcome();
  }, [profile, onboardedAt, openWelcome]);

  // Locate + track the spotlighted element.
  useEffect(() => {
    if (!step) {
      setTarget(null);
      return;
    }

    let cancelled = false;
    const timers: number[] = [];

    const update = () => {
      if (cancelled) return;
      if (!step.target) {
        setTarget(null);
        return;
      }
      const el = findVisibleTarget(step.target);
      setTarget(el ? measure(el) : null);
    };

    update();

    if (step.target) {
      const el = findVisibleTarget(step.target);
      if (el) {
        const rect = el.getBoundingClientRect();
        const fullyVisible =
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= window.innerHeight &&
          rect.right <= window.innerWidth;
        if (!fullyVisible) {
          const reduced = window.matchMedia(
            '(prefers-reduced-motion: reduce)',
          ).matches;
          el.scrollIntoView({
            block: 'center',
            inline: 'nearest',
            behavior: reduced ? 'auto' : 'smooth',
          });
          for (const delay of [80, 200, 380, 600]) {
            timers.push(window.setTimeout(update, delay));
          }
        }
      }
    }

    const onViewportChange = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      update();
    };

    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', update, true);

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(update)
        : null;
    const observed = step.target ? findVisibleTarget(step.target) : null;
    if (observed) resizeObserver?.observe(observed);

    return () => {
      cancelled = true;
      for (const timer of timers) window.clearTimeout(timer);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', update, true);
      resizeObserver?.disconnect();
    };
  }, [step, stepIndex]);

  // Track the popover's real height so placement can avoid clipping.
  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    setPopoverHeight(el.offsetHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setPopoverHeight(el.offsetHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [step, viewport.width]);

  // Keyboard control + focus handling for the whole tour.
  useEffect(() => {
    if (!tour) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => {
      popoverRef.current?.focus({ preventScroll: true });
    }, 40);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        useTutorialStore.getState().closeTour();
        return;
      }
      const targetEl = event.target as HTMLElement | null;
      if (
        targetEl &&
        (targetEl.tagName === 'INPUT' ||
          targetEl.tagName === 'TEXTAREA' ||
          targetEl.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        useTutorialStore.getState().nextStep();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        useTutorialStore.getState().prevStep();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey, true);
      if (previouslyFocused && document.body.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [tour]);

  const isMobile = viewport.width < 640;
  const popoverWidth = Math.min(
    POPOVER_WIDTH,
    viewport.width - VIEWPORT_MARGIN * 2,
  );

  const position: Position = isMobile
    ? {
        left: VIEWPORT_MARGIN,
        top: Math.max(
          VIEWPORT_MARGIN,
          viewport.height - popoverHeight - 86,
        ),
      }
    : computePosition(
        target,
        step?.placement,
        viewport.width,
        viewport.height,
        popoverWidth,
        popoverHeight,
      );

  const spotlight = target
    ? {
        left: target.left - SPOTLIGHT_PADDING,
        top: target.top - SPOTLIGHT_PADDING,
        width: target.width + SPOTLIGHT_PADDING * 2,
        height: target.height + SPOTLIGHT_PADDING * 2,
      }
    : null;

  const totalSteps = tour?.steps.length ?? 0;
  const isLast = stepIndex >= totalSteps - 1;

  return (
    <>
      <WelcomeDialog />

      {tour && step
        ? createPortal(
            <div className="tour-root">
              <div
                className={
                  target
                    ? 'tour-backdrop tour-backdrop--clear'
                    : 'tour-backdrop'
                }
                aria-hidden="true"
              />
              {spotlight && (
                <div
                  className="tour-spotlight"
                  style={{
                    left: spotlight.left,
                    top: spotlight.top,
                    width: spotlight.width,
                    height: spotlight.height,
                  }}
                  aria-hidden="true"
                />
              )}

              <div
                ref={popoverRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                style={{
                  left: position.left,
                  top: position.top,
                  width: isMobile ? undefined : popoverWidth,
                  right: isMobile ? VIEWPORT_MARGIN : undefined,
                }}
                className="tour-popover"
              >
                <div className="flex items-start justify-between gap-3 border-b border-outline-variant/70 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon name={step.icon ?? tour.icon} size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                        {tour.title}
                      </p>
                      <p className="text-[11px] text-on-surface-variant">
                        Step {stepIndex + 1} of {totalSteps}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => useTutorialStore.getState().closeTour()}
                    className="-mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                    aria-label="End tour"
                  >
                    <Icon name="close" size={17} />
                  </button>
                </div>

                <div className="px-4 py-4">
                  <h3
                    id={titleId}
                    className="text-base font-bold tracking-tight text-on-surface"
                  >
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-on-surface-variant">
                    {step.body}
                  </p>
                  {step.tip && (
                    <div className="mt-3 flex gap-2 rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-2">
                      <Icon
                        name="lightbulb"
                        size={16}
                        className="mt-0.5 shrink-0 text-primary"
                      />
                      <p className="text-xs leading-relaxed text-on-surface">
                        {step.tip}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-outline-variant/70 px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {tour.steps.map((s, index) => (
                      <button
                        key={`${s.title}-${index}`}
                        type="button"
                        onClick={() =>
                          useTutorialStore.getState().goToStep(index)
                        }
                        className={
                          index === stepIndex
                            ? 'tour-dot tour-dot--active'
                            : 'tour-dot'
                        }
                        aria-label={`Go to step ${index + 1}`}
                        aria-current={index === stepIndex ? 'step' : undefined}
                      />
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => useTutorialStore.getState().prevStep()}
                      disabled={stepIndex === 0}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        isLast
                          ? useTutorialStore.getState().completeActiveTour()
                          : useTutorialStore.getState().nextStep()
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-on-primary transition-opacity hover:opacity-90"
                    >
                      {isLast ? 'Done' : 'Next'}
                      {!isLast && <Icon name="arrow_forward" size={15} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
