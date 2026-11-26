import { useEffect, useState } from 'react';
import { motionAllowed, useMotionStore } from '../store/motion.store';

/** Tracks the OS-level reduced-motion preference. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return reduced;
}

/**
 * True when the browser preference and the per-browser Motion setting both
 * allow animation. This is the single gate for rolling values and brand marks.
 */
export function useMotionEnabled(): boolean {
  const loadingAnimations = useMotionStore((s) => s.loadingAnimations);
  const reduced = useReducedMotion();
  return motionAllowed(loadingAnimations, reduced);
}

/** True only when the text loading-animation preference allows decoding. */
export function useTextMotionEnabled(): boolean {
  const textLoadingAnimations = useMotionStore(
    (s) => s.textLoadingAnimations,
  );
  const reduced = useReducedMotion();
  return motionAllowed(textLoadingAnimations, reduced);
}

/** True only when the landing-page intro preference allows the splash. */
export function useLandingIntroEnabled(): boolean {
  const landingIntroAnimations = useMotionStore(
    (s) => s.landingIntroAnimations,
  );
  const reduced = useReducedMotion();
  return motionAllowed(landingIntroAnimations, reduced);
}
