/**
 * Shared body-scroll lock.
 *
 * The side drawer, the mobile nav drawer, modals, and the mobile notification
 * sheet can all be open at once (for example: schedule drawer → unfinalize
 * modal). Each surface used to save/restore `document.body.style.overflow` on
 * its own, so an inner surface closing could restore a stale value and leave
 * the page locked until refresh.
 *
 * A single reference count fixes that: the first locker remembers the original
 * inline styles, the last release restores them, and the order of release no
 * longer matters.
 */

let lockCount = 0;
let savedOverflow = '';
let savedPaddingRight = '';

export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => undefined;

  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    savedPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  lockCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.body.style.overflow = savedOverflow;
      document.body.style.paddingRight = savedPaddingRight;
    }
  };
}
