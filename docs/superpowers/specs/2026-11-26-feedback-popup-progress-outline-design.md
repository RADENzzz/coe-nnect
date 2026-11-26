# Feedback popup progress outline

> **Superseded by:** `docs/superpowers/specs/2026-11-26-feedback-popup-sheen-timer-design.md`

- Date: 2026-11-26
- Status: Draft — awaiting approval
- Scope: `FeedbackToast.tsx`, `globals.css`, `feedback-popup.test.ts`

## Intent

The feedback popup currently shows a small left accent bar and a 3px bottom countdown line, with a static check/error icon. The user wants the remaining time to read as a loading outline around the **whole box**, colored to match the feedback result, plus a drawn check or X so success and failure are obvious at a glance.

This is a small visual change. It must not disturb the existing queue, top-center placement, ~6s auto-close, manual close, mute-aware sounds, or hover/focus pause behavior.

## Approaches

1. **Perimeter trace + drawn check/X (chosen).** An SVG rectangle sits just inside the card edge with a neutral track and a variant-colored progress stroke. `stroke-dashoffset` runs from full to zero over the item's duration, so the colored line visibly draws around the whole card. A small inline SVG check (success) or X (error/failed) draws its strokes on arrival. The bottom line and left accent bar are removed; the outline carries the color.
2. **Perimeter trace + popped icon.** Same outline, but the icon springs in with a bounce instead of drawing. More playful, less precise; rejected.
3. **Full outline pulse + drawn icon.** The whole border is colored from the start and breathes gently. Calm, but it no longer communicates time left; rejected.

## Decisions

- Success uses the existing green family (`emerald-500` / `emerald-600`); `error` and `failed` use the existing red family (`red-500`/`red-600`). The outline, icon stroke, label, and icon background all come from the same variant token.
- The outline uses `stroke-dasharray="100"` with `pathLength="100"`, so one CSS animation works for any card size. The progress stroke animates `stroke-dashoffset: 100 → 0` over `var(--feedback-duration, 6000ms)`, driven by the active item's `durationMs`. The existing 800ms minimum is unchanged.
- The banner gets `key={item.id}` so queued replacements restart both the outline and icon animation instead of inheriting a finished animation state.
- Hover, focus, and hidden-tab pause set `animationPlayState: 'paused'` on the animated SVG elements. Mouse leave, blur, and tab visible resume both the JS timer and the SVG animations.
- The manual dismiss button stays in the top-right corner. It keeps its `aria-label="Dismiss message"`; its neutral X is visually distinct from the larger variant-colored result X.
- Under `prefers-reduced-motion: reduce`, show a static full-colored outline and completed check/X with no animation. The status remains visible and readable; motion is suppressed.
- No changes to sounds, queue order, role semantics (`role="status"`/`role="alert"`), portal placement, top spacing, or other features. No commits.

## Verification

- Update `apps/frontend/src/components/ui/feedback-popup.test.ts` to stop asserting the old `feedback-countdown` line and instead prove:
  - both status and alert banners render the outline SVG and result icon;
  - success renders a check path, error/failed render an X path;
  - CSS defines the outline trace and icon draw keyframes, uses `stroke-dashoffset`, and binds `--feedback-duration`;
  - pause state reaches the animated elements;
  - reduced motion disables animation only, while the outline and icon remain present.
- Keep the existing portal, width, top-bar clearance, sound, and provider-mount assertions.
- Run the focused `feedback-popup.test.ts`, `pnpm typecheck`, and `pnpm test` in `apps/frontend`, then root `pnpm typecheck`/`pnpm test`.
- Human check in the browser: green check and red X draw correctly; the colored outline traces the entire card over ~6s; hover pauses and mouse-leave resumes; queued messages restart cleanly; manual dismiss still works.

## Non-goals

- No new sound or animation library.
- No changes to the subject-request work currently paused in the same uncommitted checkout.
- No commits, pushes, merges, or PRs.
