# Feedback Popup Progress Outline Implementation Plan

> **Superseded by:** `docs/superpowers/plans/2026-11-26-feedback-popup-sheen-timer.md`
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the feedback popup’s bottom countdown line with a variant-colored SVG outline that traces the whole card and a drawn check/X result icon.

**Architecture:** `FeedbackToast.tsx` keeps the queue/timer logic and renders one SVG outline plus one SVG result icon per active banner. `globals.css` owns the trace/draw keyframes, static reduced-motion state, and variant color via `currentColor`; the component supplies duration and pause state as inline styles.

**Tech Stack:** React/TypeScript, Tailwind CSS, custom CSS keyframes, `node:test` source-level tests.

**Spec:** `docs/superpowers/specs/2026-11-26-feedback-popup-progress-outline-design.md`

## Global Constraints

- Do **not** commit, push, merge, or open a PR. All work stays uncommitted.
- Keep the existing portal, top-center placement, width cap, top-bar clearance, queue, ~6s auto-close, manual dismiss, and mute-aware sounds unchanged.
- There is one active feedback item at a time; queued items must restart animations when promoted.
- Success is green (`emerald-*`); `error` and `failed` are red (`red-*`). The outline and result icon use the same variant color family.
- Hover/focus/hidden-tab pause applies to both the JS timer and the SVG animations.
- Reduced motion shows a static full outline and completed check/X, not a hidden or empty state.
- Do not touch the paused subject-request work or prospectus/popup-adjacent files outside the three files named below.

## Review Focus

- **Custom duration:** a caller passes `durationMs: 900`; the outline must finish at the same time as the JS dismissal — pinned by the `--feedback-duration` assertion in Task 1 Step 1.
- **Hover pause:** hovering mid-trace freezes the outline and leaving resumes it from the same point — pinned by the `playState` assertion in Task 1 Step 1.
- **Queued replacement:** a second message promoted from the queue must redraw from empty, not inherit a completed stroke — pinned by the `key={item.id}` assertion in Task 1 Step 1.
- **Reduced motion:** the status must remain visible with a full outline and completed icon while animation is suppressed — pinned by the reduced-motion CSS assertions in Task 1 Step 1.
- **Variant correctness:** success shows a green check; error/failed show a red X; the neutral manual-close button remains distinct — pinned by the result-path and color-class assertions in Task 1 Step 1.

---

### Task 1: Replace countdown line with progress outline

**Files:**
- Modify: `apps/frontend/src/components/ui/FeedbackToast.tsx`
- Modify: `apps/frontend/src/styles/globals.css`
- Modify: `apps/frontend/src/components/ui/feedback-popup.test.ts`
- Test: `apps/frontend/src/components/ui/feedback-popup.test.ts`

**Interfaces:**
- Consumes: `FeedbackItem.durationMs`, `FeedbackItem.variant`, existing `paused` state and `dismissActive`.
- Produces: rendered `.feedback-outline`, `.feedback-outline-progress`, `.feedback-result-icon`, and `.feedback-result-path` elements; CSS classes/keyframes with the same names; no `.feedback-countdown` or `.feedback-countdown` markup.

- [ ] **Step 1: Write the failing tests**

Replace the assertions on the old countdown in `apps/frontend/src/components/ui/feedback-popup.test.ts`:

```ts
test('feedback popup renders as one top-center portal item', () => {
  const source = read('apps/frontend/src/components/ui/FeedbackToast.tsx');
  assert.match(source, /createPortal\(/);
  assert.match(source, /fixed left-1\/2/);
  assert.match(source, /role="alert"/);
  assert.match(source, /role="status"/);
  assert.match(source, /feedback-outline/);
  assert.match(source, /feedback-result-icon/);
  assert.match(source, /queue/);
  assert.doesNotMatch(source, /feedback-countdown/);
  assert.doesNotMatch(source, /sm:right-6/);
});

test('outline uses the active duration and pauses with the banner', () => {
  const source = read('apps/frontend/src/components/ui/FeedbackToast.tsx');
  assert.match(source, /'--feedback-duration': `\$\{item\.durationMs\}ms`/);
  assert.match(source, /const playState = paused \? 'paused' : 'running'/);
  assert.match(source, /animationPlayState: playState/);
  assert.match(source, /key=\{item\.id\}/);
});

test('success draws a check and error/failed draw an X', () => {
  const source = read('apps/frontend/src/components/ui/FeedbackToast.tsx');
  const meta = source.slice(
    source.indexOf('const VARIANT_META'),
    source.indexOf('const MIN_DURATION_MS'),
  );
  const success = meta.slice(meta.indexOf('success:'), meta.indexOf('error:'));
  const error = meta.slice(meta.indexOf('error:'), meta.indexOf('failed:'));
  const failed = meta.slice(meta.indexOf('failed:'));

  assert.match(source, /M4 12\.5 9\.5 18 20 6\.5/);
  assert.match(source, /M5 5 19 19M19 5 5 19/);
  assert.match(success, /result: 'check'/);
  assert.match(success, /text-emerald-500/);
  assert.match(success, /text-emerald-600/);
  assert.match(error, /result: 'cross'/);
  assert.match(error, /text-red-500/);
  assert.match(failed, /result: 'cross'/);
  assert.match(failed, /text-red-600/);
  assert.match(source, /aria-label="Dismiss message"/);
  assert.match(source, /<Icon name="close" size=\{14\}/);
  assert.doesNotMatch(source, /absolute inset-y-0 left-0 w-1/);
});

test('outline trace and icon draw are defined in CSS', () => {
  const css = read('apps/frontend/src/styles/globals.css');
  assert.match(css, /@keyframes feedback-outline-trace/);
  assert.match(css, /@keyframes feedback-result-draw/);
  assert.match(css, /\.feedback-outline-progress\s*\{/);
  assert.match(css, /\.feedback-result-path\s*\{/);
  assert.match(css, /stroke-dasharray:\s*100;/);
  assert.match(css, /stroke:\s*currentColor;/);
  assert.doesNotMatch(css, /\.feedback-countdown\s*\{/);
});

test('reduced motion leaves a static full outline and completed icon', () => {
  const css = read('apps/frontend/src/styles/globals.css');
  const start = css.indexOf('.feedback-outline-progress {');
  assert.ok(start >= 0);
  const ruleAndReducedMotion = css.slice(start, start + 900);
  assert.match(ruleAndReducedMotion, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(ruleAndReducedMotion, /stroke-dashoffset:\s*0;/);
});
```

Keep the existing portal width, top-bar clearance, sound, and provider-mount tests. Delete the two old countdown-specific tests (`countdown line animates outside reduced-motion suppression` and `countdown line has a visible background color`).

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `cd apps/frontend && pnpm exec node --test src/components/ui/feedback-popup.test.ts`
Expected: FAIL because the outline markup and CSS do not exist.

- [ ] **Step 3: Implement the component markup**

In `FeedbackToast.tsx`:

- Import `type CSSProperties` from `react`.
- Add a `RESULT_PATHS` record with exactly two keys, `check: 'M4 12.5 9.5 18 20 6.5'` and `cross: 'M5 5 19 19M19 5 5 19'`.
- Update the `VARIANT_META` value type: replace `icon` and `accent` with `result: 'check' | 'cross'`, `outlineClass: string`, and `iconClass: string`; keep `label`, `iconWrap`, `labelClass`, and `defaultDurationMs`.
- Set `success` to `result: 'check'`, `outlineClass: 'text-emerald-500'`, `iconClass: 'text-emerald-600'`, `iconWrap: 'bg-emerald-50'`, `labelClass: 'text-emerald-700'`; set `error` to `result: 'cross'`, `outlineClass: 'text-red-500'`; set `failed` to `result: 'cross'`, `outlineClass: 'text-red-600'`. Keep `iconWrap: 'bg-red-50'` and `labelClass: 'text-red-700'` for both red variants.
- In `renderBanner`, add `const playState = paused ? 'paused' : 'running'`.
- Put `key={item.id}` on both the `role="status"` and `role="alert"` root divs.
- Set the root div style to `{ '--feedback-duration': `${item.durationMs}ms` } as CSSProperties`.
- Remove the left accent `<span>` and the `.feedback-countdown` `<span>`.
- Render an SVG with `className={`feedback-outline pointer-events-none absolute inset-0 h-full w-full ${meta.outlineClass}`}`, `viewBox="0 0 100 100"`, `preserveAspectRatio="none"`, and `aria-hidden`. Inside it render:
  - a neutral `<rect className="feedback-outline-track" x="1" y="1" width="98" height="98" rx="5" vectorEffect="non-scaling-stroke" />`;
  - a progress `<rect className="feedback-outline-progress" pathLength="100" x="1" y="1" width="98" height="98" rx="5" vectorEffect="non-scaling-stroke" style={{ animationPlayState: playState }} />`.
- Replace the static `Icon` in the icon wrap with an SVG `className={`feedback-result-icon h-[18px] w-[18px] ${meta.iconClass}`}`, `viewBox="0 0 24 24"`, `aria-hidden`, and one `<path className="feedback-result-path" pathLength="32" d={RESULT_PATHS[meta.result]} style={{ animationPlayState: playState }} />`.

- [ ] **Step 4: Implement the CSS**

In `globals.css`, replace the `@keyframes countdown` and `.feedback-countdown` rule with:

```css
@keyframes feedback-outline-trace {
  from {
    stroke-dashoffset: 100;
  }
  to {
    stroke-dashoffset: 0;
  }
}

.feedback-outline-track {
  fill: none;
  stroke: rgba(148, 163, 184, 0.4);
  stroke-width: 2;
}

.feedback-outline-progress {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  animation: feedback-outline-trace var(--feedback-duration, 6000ms) linear forwards;
}

@keyframes feedback-result-draw {
  from {
    stroke-dashoffset: 32;
  }
  to {
    stroke-dashoffset: 0;
  }
}

.feedback-result-path {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 32;
  stroke-dashoffset: 32;
  animation: feedback-result-draw 620ms ease-out 120ms forwards;
}

@media (prefers-reduced-motion: reduce) {
  .feedback-outline-progress,
  .feedback-result-path {
    animation: none;
    stroke-dashoffset: 0;
  }
}
```

Keep `body:has(.app-shell) .feedback-portal` and every unrelated keyframe untouched.

- [ ] **Step 5: Verify**

Run sequentially from the repository root:

```powershell
Set-Location apps/frontend
pnpm exec node --test src/components/ui/feedback-popup.test.ts
if ($LASTEXITCODE -ne 0) { throw 'focused test failed' }
pnpm typecheck
if ($LASTEXITCODE -ne 0) { throw 'typecheck failed' }
pnpm test
if ($LASTEXITCODE -ne 0) { throw 'frontend tests failed' }
```

Expected: focused test passes, typecheck clean, full frontend suite passes.

- [ ] **Step 6: No commit**

Do not commit. Report `commits: none` and the exact commands/output used.
