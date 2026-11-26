# Feedback Popup Sheen Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the feedback popup’s stretched SVG outline with a sharp, tinted box whose border sheen shrinks like a timer, and hide the popup when the user leaves the tab or window.

**Architecture:** `FeedbackToast.tsx` keeps timer logic, makes every new feedback replace the active item, and renders a masked `.feedback-sheen` child plus the existing drawn result icon. `globals.css` owns the registered custom properties, finite conic-gradient animation, square-box styling hooks, and reduced-motion state. Away events call one `hideOnAway` callback that clears the active item instead of pausing.

**Tech Stack:** React/TypeScript, Tailwind CSS, custom CSS keyframes and `@property`, `node:test` source-level tests.

**Spec:** `docs/superpowers/specs/2026-11-26-feedback-popup-sheen-timer-design.md`

## Global Constraints

- Do **not** commit, push, merge, or open a PR. All work stays uncommitted.
- Only `apps/frontend/src/components/ui/FeedbackToast.tsx`, `apps/frontend/src/styles/globals.css`, and `apps/frontend/src/components/ui/feedback-popup.test.ts` may change.
- The banner is a **sharp-cornered box**: no `rounded-*` on the banner or sheen.
- Success is emerald; `error` and `failed` are red. The border, sheen, and result icon stay in the same variant family.
- The sheen is finite: angle `0deg → 360deg`, length `140deg → 0deg`, over `var(--feedback-duration, 6000ms)`, ending exactly when the JS timer dismisses.
- Hover/focus pause remains; mouse leave/blur resume while the page is active.
- There is no queue: every new feedback immediately replaces the active item, resets pause, restarts the timer/sound, and remounts via `key={item.id}`. `FeedbackOptions.id` is accepted but ignored.
- Leaving the tab/window dismisses the active popup; returning must not replay anything.
- Keep the portal, top-center placement, width cap, top-bar clearance, sounds, role semantics, and manual dismiss unchanged. Remove the queue.
- Retain `@keyframes countdown` and `.animate-countdown` for `SystemStatusBanner.tsx`; remove only the feedback-specific outline CSS.
- Do not touch subject-request or prospectus files.

## Review Focus

- **White strip:** a wide card must show a tinted full-bleed box with a colored edge, no SVG inset — pinned by the sharp/tinted-box test.
- **Timer feel:** the sheen must shrink to empty, not loop — pinned by the `@property`, keyframe, and duration assertions.
- **Away stuck popup:** switching tab/window or leaving the document must clear the active popup, not pause — pinned by the away-dismissal test.
- **Immediate replacement:** a second feedback must replace the active item and restart the finite sheen — pinned by the replacement assertion and `key={item.id}`.
- **Reduced motion:** status must stay visible on a solid colored border with a completed check/X — pinned by the reduced-motion test.

---

### Task 1: Replace outline with square-box sheen timer and away auto-hide

**Files:**
- Modify: `apps/frontend/src/components/ui/FeedbackToast.tsx`
- Modify: `apps/frontend/src/styles/globals.css`
- Modify: `apps/frontend/src/components/ui/feedback-popup.test.ts`
- Test: `apps/frontend/src/components/ui/feedback-popup.test.ts`

**Interfaces:**
- Consumes: `FeedbackItem.durationMs`, `FeedbackItem.variant`, `RESULT_PATHS`, `paused`, `clearTimer`, `dismissActive`, `onBannerEnter`, `onBannerLeave`.
- Produces: `.feedback-sheen` markup, `hideOnAway` callback, `toneClass` variant metadata, `--feedback-sheen-angle`/`--feedback-sheen-length` CSS properties, and no `.feedback-outline` markup/CSS.

- [ ] **Step 1: Write the failing tests**

Replace tests 1, 6, 7, 8, and 9 in `apps/frontend/src/components/ui/feedback-popup.test.ts` with the following, and add the two new tests. Keep tests 2–5 (width, top-bar, sounds, provider mount) exactly as they are.

```ts
test('feedback popup renders as one top-center portal item', () => {
  const source = read('apps/frontend/src/components/ui/FeedbackToast.tsx');
  assert.match(source, /createPortal\(/);
  assert.match(source, /fixed left-1\/2/);
  assert.match(source, /role="alert"/);
  assert.match(source, /role="status"/);
  assert.match(source, /feedback-sheen/);
  assert.match(source, /feedback-result-icon/);
  assert.doesNotMatch(source, /feedback-outline/);
  assert.doesNotMatch(source, /sm:right-6/);
});

test('popup is a sharp tinted box, not a rounded white outline', () => {
  const source = read('apps/frontend/src/components/ui/FeedbackToast.tsx');
  const meta = source.slice(
    source.indexOf('const VARIANT_META'),
    source.indexOf('const MIN_DURATION_MS'),
  );
  const banner = source.slice(
    source.indexOf('const bannerClass'),
    source.indexOf('const body'),
  );

  assert.match(banner, /border-2/);
  assert.match(banner, /meta\.toneClass/);
  assert.doesNotMatch(banner, /rounded-xl/);
  assert.doesNotMatch(banner, /bg-white/);
  assert.match(meta, /toneClass: 'text-emerald-600 border-emerald-500 bg-emerald-50'/);
  assert.match(meta, /toneClass: 'text-red-600 border-red-500 bg-red-50'/);
  assert.match(meta, /toneClass: 'text-red-700 border-red-600 bg-red-50'/);
  assert.match(source, /rounded-none/);
});

test('new feedback replaces the active popup instead of queueing it', () => {
  const source = read('apps/frontend/src/components/ui/FeedbackToast.tsx');
  const becomeActive = source.slice(
    source.indexOf('const becomeActive'),
    source.indexOf('const push'),
  );
  const push = source.slice(source.indexOf('const push'), source.indexOf('const pauseTimer'));

  assert.match(becomeActive, /setPaused\(false\)/);
  assert.match(push, /becomeActive\(item\)/);
  assert.doesNotMatch(source, /queueRef/);
  assert.doesNotMatch(source, /updateQueue/);
  assert.doesNotMatch(source, /userId/);
});

test('sheen uses the active duration and pauses with the banner', () => {
  const source = read('apps/frontend/src/components/ui/FeedbackToast.tsx');
  assert.match(source, /'--feedback-duration': `\$\{item\.durationMs\}ms`/);
  assert.match(source, /const playState = paused \? 'paused' : 'running'/);
  const sheen = source.slice(
    source.indexOf('className="feedback-sheen'),
    source.indexOf('className="flex gap-3'),
  );
  const resultPath = source.slice(
    source.indexOf('className="feedback-result-path'),
    source.indexOf('</svg>', source.indexOf('className="feedback-result-path')),
  );
  assert.match(sheen, /animationPlayState: playState/);
  assert.match(resultPath, /animationPlayState: playState/);
  assert.match(source, /key=\{item\.id\}/);
  assert.match(source, /onMouseEnter=\{onBannerEnter\}/);
  assert.match(source, /onMouseLeave=\{onBannerLeave\}/);
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
  assert.match(success, /text-emerald-600/);
  assert.match(error, /result: 'cross'/);
  assert.match(error, /border-red-500/);
  assert.match(failed, /result: 'cross'/);
  assert.match(failed, /border-red-600/);
  assert.match(source, /aria-label="Dismiss message"/);
  assert.match(source, /<Icon name="close" size=\{14\}/);
});

test('sheen shrinks around the square edge over the active duration', () => {
  const css = read('apps/frontend/src/styles/globals.css');
  const propertyStart = css.indexOf('@property --feedback-sheen-angle');
  const layerStart = css.indexOf('@layer utilities');
  assert.ok(propertyStart >= 0 && propertyStart < layerStart);

  assert.match(css, /@property --feedback-sheen-angle\s*\{/);
  assert.match(css, /@property --feedback-sheen-length\s*\{/);
  assert.match(css, /@keyframes feedback-sheen\s*\{/);
  assert.match(css, /--feedback-sheen-angle:\s*360deg;/);
  assert.match(css, /--feedback-sheen-length:\s*0deg;/);
  assert.match(css, /@supports \(color: color-mix\(in srgb, red 50%, white\)\)/);

  const start = css.indexOf('.feedback-sheen {');
  const rule = css.slice(start, start + 1100);
  assert.match(rule, /conic-gradient\(/);
  assert.match(rule, /var\(--feedback-sheen-angle\)/);
  assert.match(rule, /var\(--feedback-sheen-length\)/);
  assert.match(rule, /mask-composite:\s*exclude/);
  assert.match(css, /calc\(var\(--feedback-sheen-length\) \* 1\.08\)/);
  assert.doesNotMatch(css, /\+ 12deg/);
  assert.match(rule, /animation:\s*feedback-sheen var\(--feedback-duration, 6000ms\) linear forwards/);
  assert.doesNotMatch(css, /@keyframes feedback-outline-trace/);
  assert.doesNotMatch(css, /\.feedback-outline-progress\s*\{/);
});

test('reduced motion hides sheen and completes the icon', () => {
  const css = read('apps/frontend/src/styles/globals.css');
  const start = css.indexOf(
    '@media (prefers-reduced-motion: reduce) {',
    css.indexOf('.feedback-result-path'),
  );
  assert.ok(start >= 0);
  const block = css.slice(start, start + 420);
  assert.match(block, /\.feedback-sheen\s*\{\s*display: none;/);
  assert.match(block, /\.feedback-result-path\s*\{[\s\S]*animation: none;/);
  assert.match(block, /\.feedback-result-path\s*\{[\s\S]*stroke-dashoffset: 0;/);
});

test('leaving the tab or window hides the popup', () => {
  const source = read('apps/frontend/src/components/ui/FeedbackToast.tsx');
  assert.match(source, /const hideOnAway = useCallback\(\(\) => \{/);
  assert.match(source, /clearTimer\(\);/);
  assert.match(source, /activeRef\.current = null;/);
  assert.match(source, /remainingRef\.current = 0;/);
  assert.match(source, /setPaused\(false\);/);
  assert.match(source, /setActive\(null\);/);
  assert.match(source, /window\.addEventListener\('blur', hideOnAway\)/);
  assert.match(source, /document\.addEventListener\('mouseleave', hideOnAway\)/);
  assert.match(source, /document\.addEventListener\('visibilitychange', onVisibility\)/);

  const visibility = source.slice(
    source.indexOf('const onVisibility'),
    source.indexOf("document.addEventListener('visibilitychange'"),
  );
  assert.match(visibility, /document\.visibilityState === 'hidden'/);
  assert.match(visibility, /hideOnAway\(\)/);
  assert.doesNotMatch(visibility, /resumeTimer/);
  assert.doesNotMatch(source, /setPaused\(hidden\)/);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run from the repository root:

```powershell
pnpm --filter @coe-nnect/frontend exec node --test src/components/ui/feedback-popup.test.ts
```

Expected: FAIL because the sheen markup/CSS and `hideOnAway` do not exist.

- [ ] **Step 3: Implement `FeedbackToast.tsx`**

In `apps/frontend/src/components/ui/FeedbackToast.tsx`:

- Update the JSDoc so it says the timer pauses on hover/focus, a new feedback immediately replaces the active one, and leaving the tab/window hides the popup.
- Remove queue state entirely: delete `queue` state, `queueRef`, `updateQueue`, the `// Promote the head of the queue` effect, and `userId` from `FeedbackItem`. Keep `FeedbackOptions.id` in the public type and update its comment to say it is accepted for compatibility but ignored.
- Change `VARIANT_META`’s value type: replace `outlineClass` with `toneClass: string`; keep `label`, `result`, `iconClass`, `iconWrap`, `labelClass`, and `defaultDurationMs`.
- Set the exact metadata values:
  - `success`: `toneClass: 'text-emerald-600 border-emerald-500 bg-emerald-50'`, `iconWrap: 'bg-white/70 border border-slate-200'`, `iconClass: 'text-emerald-600'`, `labelClass: 'text-emerald-700'`.
  - `error`: `toneClass: 'text-red-600 border-red-500 bg-red-50'`, `iconWrap: 'bg-white/70 border border-slate-200'`, `iconClass: 'text-red-600'`, `labelClass: 'text-red-700'`.
  - `failed`: `toneClass: 'text-red-700 border-red-600 bg-red-50'`, `iconWrap: 'bg-white/70 border border-slate-200'`, `iconClass: 'text-red-700'`, `labelClass: 'text-red-700'`.
- After `onBannerLeave`, add `hideOnAway` with this exact body:

```ts
const hideOnAway = useCallback(() => {
  clearTimer();
  activeRef.current = null;
  remainingRef.current = 0;
  setPaused(false);
  setActive(null);
}, [clearTimer]);
```

- In `becomeActive`, add `setPaused(false);` as the first statement so a replacement always starts fresh even if the previous banner was hovered/focused. Keep the active ref/state, `startTimer`, and sound logic otherwise unchanged.
- Replace the existing `push` callback with this body so every new message becomes active immediately:

```ts
const push = useCallback(
  (variant: FeedbackVariant, message: string, options?: FeedbackOptions) => {
    if (!message.trim()) return;
    const meta = VARIANT_META[variant];
    const durationMs = Math.max(
      MIN_DURATION_MS,
      options?.durationMs ?? meta.defaultDurationMs,
    );
    becomeActive({
      id: ++nextId.current,
      variant,
      title: options?.title?.trim() || meta.label,
      message: message.trim(),
      durationMs,
    });
  },
  [becomeActive],
);
```

- Replace the existing `visibilitychange` effect with listeners for `visibilitychange`, `blur`, and document `mouseleave`:

```ts
useEffect(() => {
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') hideOnAway();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('blur', hideOnAway);
  document.addEventListener('mouseleave', hideOnAway);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('blur', hideOnAway);
    document.removeEventListener('mouseleave', hideOnAway);
  };
}, [hideOnAway]);
```

- In `renderBanner`, keep `playState` and `bannerStyle` as-is. Replace `bannerClass` with the following; deliberately drop `overflow-hidden` so the sheen can cover the border ring:

```ts
const bannerClass =
  'pointer-events-auto relative border-2 shadow-2xl animate-fade-up ' +
  meta.toneClass;
```

- Remove the entire SVG `feedback-outline` element. As the first child of `body`, render:

```tsx
<div
  aria-hidden
  className="feedback-sheen pointer-events-none absolute inset-0"
  style={{ animationPlayState: playState }}
/>
```

- Remove `rounded-lg` from the result-icon wrapper; it now uses `${meta.iconWrap}` only.
- Keep the result SVG, `feedback-result-path`, `pathLength="32"`, `RESULT_PATHS[meta.result]`, and its `animationPlayState: playState`.
- Make the manual close button square by adding `rounded-none border border-slate-200 bg-white/60` to its class list. Keep `aria-label="Dismiss message"` and `<Icon name="close" size={14} />`.
- Keep `key={item.id}`, `role="status"`/`role="alert"`, `onMouseEnter`, `onMouseLeave`, `onFocus`, and `onBlur` on the root divs.

- [ ] **Step 4: Implement `globals.css`**

In `apps/frontend/src/styles/globals.css`:

- Insert these top-level rules immediately before `@layer utilities` (around line 462), not inside a layer:

```css
@property --feedback-sheen-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

@property --feedback-sheen-length {
  syntax: '<angle>';
  initial-value: 140deg;
  inherits: false;
}
```

- Replace the block from `@keyframes feedback-outline-trace` through the existing feedback reduced-motion block (currently around lines 1197–1248) with:

```css
@keyframes feedback-sheen {
  from {
    --feedback-sheen-angle: 0deg;
    --feedback-sheen-length: 140deg;
  }
  to {
    --feedback-sheen-angle: 360deg;
    --feedback-sheen-length: 0deg;
  }
}

.feedback-sheen {
  position: absolute;
  inset: -2px;
  padding: 2px;
  background: conic-gradient(
    from var(--feedback-sheen-angle),
    transparent 0deg,
    currentColor var(--feedback-sheen-length),
    transparent calc(var(--feedback-sheen-length) * 1.08),
    transparent 360deg
  );
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  animation: feedback-sheen var(--feedback-duration, 6000ms) linear forwards;
}

@supports (color: color-mix(in srgb, red 50%, white)) {
  .feedback-sheen {
    background: conic-gradient(
      from var(--feedback-sheen-angle),
      transparent 0deg,
      color-mix(in srgb, currentColor 45%, white) var(--feedback-sheen-length),
      transparent calc(var(--feedback-sheen-length) * 1.08),
      transparent 360deg
    );
  }
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
  .feedback-sheen {
    display: none;
  }
  .feedback-result-path {
    animation: none;
    stroke-dashoffset: 0;
  }
}
```

- Keep `body:has(.app-shell) .feedback-portal`, `@keyframes countdown`, `.animate-countdown`, and every unrelated keyframe untouched.

- [ ] **Step 5: Verify**

Run sequentially from the repository root. PowerShell 5.1 may reject `&&`, so use `$LASTEXITCODE`:

```powershell
pnpm --filter @coe-nnect/frontend exec node --test src/components/ui/feedback-popup.test.ts
if ($LASTEXITCODE -ne 0) { throw 'focused test failed' }
pnpm --filter @coe-nnect/frontend typecheck
if ($LASTEXITCODE -ne 0) { throw 'frontend typecheck failed' }
pnpm --filter @coe-nnect/frontend test
if ($LASTEXITCODE -ne 0) { throw 'frontend tests failed' }
pnpm typecheck
if ($LASTEXITCODE -ne 0) { throw 'root typecheck failed' }
pnpm test
if ($LASTEXITCODE -ne 0) { throw 'root tests failed' }
pnpm --filter @coe-nnect/frontend build
if ($LASTEXITCODE -ne 0) { throw 'frontend build failed' }
```

Expected: focused 12/12, frontend suite 130/130, typechecks clean, root suite passes, frontend build succeeds.

- [ ] **Step 6: No commit**

Do not commit. Report `commits: none` and the exact commands/output used.

---
