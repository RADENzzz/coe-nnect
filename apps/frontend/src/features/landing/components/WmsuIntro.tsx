import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import WmsuSeal from '../../../components/brand/WmsuSeal';
import { useMotionEnabled } from '../../../hooks/use-motion-enabled';

/**
 * Session-scoped key: the splash plays on the first landing-page visit in a
 * browser tab, then stays out of the way for the rest of that session.
 */
export const WMSU_INTRO_SESSION_KEY = 'coe-nnect:wmsu-intro-seen';

/** Keep these in sync with the progress/exit animations in globals.css. */
const HOLD_MS = 1650;
const EXIT_MS = 420;

function shouldPlayIntro(): boolean {
  try {
    return sessionStorage.getItem(WMSU_INTRO_SESSION_KEY) !== 'true';
  } catch {
    /* Without storage, treat every page load as a first visit. */
    return true;
  }
}

/**
 * A brief WMSU seal splash for the public landing page. It plays once per
 * browser tab, can be skipped with a click or key, and is skipped entirely
 * when the Motion setting or prefers-reduced-motion asks for less movement.
 */
export default function WmsuIntro() {
  const motion = useMotionEnabled();
  const [visible, setVisible] = useState(() => motion && shouldPlayIntro());
  const [leaving, setLeaving] = useState(false);

  const dismiss = useCallback(() => setLeaving(true), []);

  // Remember the visit as soon as the intro starts, so a refresh stays quiet.
  useEffect(() => {
    if (!visible) return;
    try {
      sessionStorage.setItem(WMSU_INTRO_SESSION_KEY, 'true');
    } catch {
      /* The intro still plays for this page load. */
    }
  }, [visible]);

  // Hold the page still behind the splash.
  useEffect(() => {
    if (!visible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [visible]);

  // Hand the page over after the hold, unless the visitor skips ahead.
  useEffect(() => {
    if (!visible || leaving) return;
    const id = window.setTimeout(() => setLeaving(true), HOLD_MS);
    return () => window.clearTimeout(id);
  }, [visible, leaving]);

  // Unmount once the fade-out finishes.
  useEffect(() => {
    if (!leaving) return;
    const id = window.setTimeout(() => setVisible(false), EXIT_MS);
    return () => window.clearTimeout(id);
  }, [leaving]);

  // Click or any of the usual skip keys ends the intro early.
  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        dismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, dismiss]);

  // If motion is turned off mid-intro, remove it immediately.
  useEffect(() => {
    if (!motion && visible) setVisible(false);
  }, [motion, visible]);

  if (!visible) return null;

  return (
    <div
      className={clsx('wmsu-intro', leaving && 'wmsu-intro--leaving')}
      onClick={dismiss}
      role="presentation"
      aria-hidden="true"
    >
      <div className="wmsu-intro__stage">
        <span className="wmsu-intro__halo" />
        <span className="wmsu-intro__plate">
          <WmsuSeal
            animated={false}
            className="h-36 w-36 sm:h-40 sm:w-40"
          />
        </span>
        <p className="wmsu-intro__eyebrow">
          Western Mindanao State University
        </p>
        <span className="wmsu-intro__rule" />
        <p className="wmsu-intro__title">
          College of Engineering and Technology
        </p>
        <p className="wmsu-intro__portal">CoE-NNECT · Scheduling Portal</p>
      </div>
      <span
        className="wmsu-intro__progress"
        style={{ animationDuration: `${HOLD_MS}ms` }}
      />
    </div>
  );
}
