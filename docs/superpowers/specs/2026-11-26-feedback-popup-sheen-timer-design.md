# Feedback popup shrinking sheen + away auto-hide

- Date: 2026-11-26
- Status: Draft — awaiting approval
- Supersedes: `docs/superpowers/specs/2026-11-26-feedback-popup-progress-outline-design.md`
- Scope: `FeedbackToast.tsx`, `globals.css`, `feedback-popup.test.ts`

## Root causes

1. **White strip outside the outline.** The current SVG uses `viewBox="0 0 100 100"` with `preserveAspectRatio="none"` on a wide card. `x="1"` is 1% of the card width, about 7px on a 720px card, so the colored stroke is drawn well inside the `bg-white` card instead of at its edge.
2. **Popup stuck when leaving the tab/window.** `visibilitychange` pauses the JS timer when the tab is hidden and resumes it when visible; there is no `window.blur` or document `mouseleave` handler. Hover/focus pause can leave `paused` true and the timer cleared when the user leaves, so the banner remains until manual dismissal.

## Intent

Keep the accepted top-center placement, ~6s duration, manual close, mute-aware sounds, and drawn check/X. Replace the stretched SVG outline with a colored card edge and a finite “shrinking sheen” that reads as a timer, not an infinite loader. Also make the popup disappear when the user leaves the tab or window instead of pausing, and make every new feedback replace the active one immediately instead of queueing it.

## Decisions

### Visual

- The banner is a **sharp-cornered box**: square corners with no `rounded-*` utility and no border radius on the sheen mask.
- The banner itself gets a solid variant-colored border and a light variant-tinted background: emerald for `success`, red for `error`/`failed`. No `bg-white` banner and no stretched SVG outline remain.
- A `.feedback-sheen` child is masked to the border ring. Its conic-gradient bright arc travels around the card while its registered CSS length shrinks from `140deg` to `0deg`; the angle animates `0deg → 360deg`. Both run over `var(--feedback-duration, 6000ms)` with `linear forwards`, so the sheen is consumed exactly when the JS timer dismisses the item.
- Use `@property --feedback-sheen-angle` and `@property --feedback-sheen-length` so the gradient interpolates smoothly. A solid colored border remains the fallback if `@property` or mask compositing is unsupported.
- The sheen inherits the banner's variant text color via `currentColor`; a `color-mix` lightening is used when supported. The neutral manual-close `Icon` stays visually distinct from the drawn result X.
- The drawn check/X SVG, `key={item.id}` restart, and `animationPlayState: playState` pause are retained for the result path and now also applied to the sheen.
- Under `prefers-reduced-motion: reduce`, hide the sheen, stop the result-path animation, and show the completed check/X against the solid colored border. Status remains fully visible.
- Hover/focus still pause the timer and animations; mouse leave/blur still resume them while the page remains active.

### Replacement

- There is no queue. Pushing any new feedback immediately replaces the active item, restarts its timer, plays its sound, and remounts the banner via the existing `key={item.id}` so the sheen and check/X animate from the start.
- `becomeActive` resets `paused` to `false` so a replacement always starts fresh even if the previous banner was hovered/focused.
- The public `FeedbackOptions.id` remains accepted for compatibility but no longer affects behavior; caller ids are not stored or compared.
- Manual dismiss and hover/focus pause while a banner remains on screen are unchanged.

### Auto-hide

- Introduce `hideOnAway`: clear the timer, clear the active item, reset `paused`, and keep the refs and state in sync so nothing replays after the user leaves.
- Call `hideOnAway` on `window.blur`, on `document.visibilitychange` when `visibilityState === 'hidden'`, and on document `mouseleave`.
- Remove hidden-tab pause/resume entirely. Returning to a visible tab does not restore a popup or replay the queue.
- Manual dismiss, hover/focus pause, sounds, portal placement, width cap, top-bar clearance, roles, and queue behavior while the page stays active are unchanged.

## Verification

- Update `feedback-popup.test.ts` to prove:
  - square corners replace `rounded-xl`, and tinted variant border/background replaces `bg-white` and the old outline SVG;
  - `.feedback-sheen` markup, `@property` declarations, keyframes, duration binding, mask, and pause state exist;
  - reduced motion hides the sheen and completes the icon;
  - `hideOnAway` is wired to `blur`, hidden `visibilitychange`, and document `mouseleave`, clears active/timer/paused, and hidden-tab resume logic is gone;
  - any new feedback calls `becomeActive` directly, `paused` is reset on replacement, and queue state/helpers are gone;
  - existing portal, width, top-bar, sound, provider-mount, check/X, and manual-dismiss assertions still pass.
- Run focused `feedback-popup.test.ts`, frontend typecheck, and full frontend suite; then root typecheck/test and frontend build.
- Human browser check: no white strip; sheen shrinks to nothing around the square edge; check/X draws; hover pauses and mouse-leave resumes; a second feedback instantly replaces the first with a fresh animation; switching tab/window or leaving the document hides the popup immediately; manual close still works.

## Non-goals

- No infinite looping sheen, no stretched SVG perimeter trace, no queue, no new sound or animation library.
- No changes to subject-request work or prospectus files.
- No commits, pushes, merges, or PRs.
