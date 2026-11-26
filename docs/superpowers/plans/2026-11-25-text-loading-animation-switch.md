# Motion preference switches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single Motion setting into three independent browser-stored switches, with text scrambling off by default and the landing intro on by default.

**Architecture:** Add two preferences beside `loadingAnimations` (`textLoadingAnimations` and `landingIntroAnimations`) and two hooks that combine them with reduced motion. Point `ScrambleText` and `WmsuIntro` at their own hooks. The existing `useMotionEnabled()` stays unchanged for numbers, brand marks, and other rolling motion, so no switch silently overrides another.

**Tech Stack:** React 18, TypeScript, Zustand, Vite, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-25-text-loading-animation-switch-design.md`

## Global Constraints

- Do not commit unless explicitly asked.
- Do not push, merge, or open a PR unless explicitly asked.
- Commit messages, when eventually requested, are plain descriptive sentences with no `feat:`, `fix:`, `chore:`, or other colon-prefixed labels.
- Keep all three preferences stored per browser in `localStorage`.
- `loadingAnimations` and `textLoadingAnimations` default to `false` when unset or when storage is unavailable.
- `landingIntroAnimations` defaults to `true` when unset or when storage is unavailable.
- Reduced-motion preference disables all three paths regardless of switch state.
- Reuse the existing Zustand store, hook, and switch markup; do not add a second animation engine or settings surface.
- No backend, database, or account-wide settings changes.
- Verification commands run from `apps/frontend`.

## Review Focus

- Fresh browser — number and text switches off, landing intro on; pinned by Task 1 Step 1 and Task 2 Step 1.
- Old `coe-nnect:loading-animations=true` with no new keys — numbers animate, text stays static, landing intro still plays; pinned by Task 1 Step 1, Task 2 Step 1, and Task 3 Step 1.
- Only `Text loading animation` on — text scrambles while numbers stay static and intro stays on; pinned by Task 1 Step 1 and Task 2 Step 1.
- OS reduced motion — all three hooks return `false` even when switches are on; pinned by Task 1 Step 1.
- Landing intro no longer follows `Loading animations` — toggling the general switch does not change the splash; pinned by Task 3 Step 1.

---

### Task 1: Independent motion preferences and hooks

**Files:**
- Modify: `apps/frontend/src/store/motion.store.ts`
- Modify: `apps/frontend/src/hooks/use-motion-enabled.ts`
- Create: `apps/frontend/src/store/motion-preferences.test.mjs`
- Modify: `apps/frontend/package.json`

**Interfaces:**
- Consumes: `useReducedMotion()` from `apps/frontend/src/hooks/use-motion-enabled.ts`; existing `useMotionStore` shape.
- Produces: `TEXT_LOADING_ANIMATIONS_STORAGE_KEY`, `LANDING_INTRO_ANIMATIONS_STORAGE_KEY`, `textLoadingAnimations`, `landingIntroAnimations`, their setters, `useTextMotionEnabled(): boolean`, and `useLandingIntroEnabled(): boolean`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/store/motion-preferences.test.mjs` with:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const store = source('./motion.store.ts');
const hooks = source('../hooks/use-motion-enabled.ts');

test('motion preferences are stored independently with their own defaults', () => {
  assert.match(
    store,
    /export const TEXT_LOADING_ANIMATIONS_STORAGE_KEY = 'coe-nnect:text-loading-animations'/,
  );
  assert.match(
    store,
    /export const LANDING_INTRO_ANIMATIONS_STORAGE_KEY = 'coe-nnect:landing-intro-animations'/,
  );
  assert.match(store, /textLoadingAnimations: readStoredTextLoadingAnimations\(\)/);
  assert.match(store, /landingIntroAnimations: readStoredLandingIntroAnimations\(\)/);
  assert.match(store, /setTextLoadingAnimations/);
  assert.match(store, /setLandingIntroAnimations/);
  assert.match(
    store,
    /localStorage\.setItem\(TEXT_LOADING_ANIMATIONS_STORAGE_KEY/,
  );
  assert.match(
    store,
    /localStorage\.setItem\(LANDING_INTRO_ANIMATIONS_STORAGE_KEY/,
  );

  const textReader = store.slice(
    store.indexOf('function readStoredTextLoadingAnimations'),
    store.indexOf('function readStoredLandingIntroAnimations'),
  );
  const introReader = store.slice(
    store.indexOf('function readStoredLandingIntroAnimations'),
    store.indexOf('interface MotionState'),
  );

  assert.match(textReader, /stored === null \? false : stored === 'true'/);
  assert.match(textReader, /return false;/);
  assert.match(introReader, /stored === null \? true : stored === 'true'/);
  assert.match(introReader, /return true;/);
});

test('motion hooks are independent and respect reduced motion', () => {
  assert.match(hooks, /export function useTextMotionEnabled\(\): boolean/);
  assert.match(
    hooks,
    /const textLoadingAnimations = useMotionStore\(\(s\) => s\.textLoadingAnimations\)/,
  );
  assert.match(hooks, /return textLoadingAnimations && !reduced/);
  assert.match(hooks, /export function useLandingIntroEnabled\(\): boolean/);
  assert.match(
    hooks,
    /const landingIntroAnimations = useMotionStore\(\(s\) => s\.landingIntroAnimations\)/,
  );
  assert.match(hooks, /return landingIntroAnimations && !reduced/);
  assert.match(hooks, /return loadingAnimations && !reduced/);
});
```

Add `src/store/motion-preferences.test.mjs` to the `test` script in `apps/frontend/package.json`, after `src/store/theme-transition.test.mjs`.

- [ ] **Step 2: Run test to verify it fails**

Run from `apps/frontend`:

```bash
node --test src/store/motion-preferences.test.mjs
```

Expected: FAIL because the new constants, fields, setters, and hooks do not exist yet.

- [ ] **Step 3: Implement the store preferences**

In `apps/frontend/src/store/motion.store.ts`:

- Add both constants exactly as asserted in Step 1.
- Add `readStoredTextLoadingAnimations(): boolean` and `readStoredLandingIntroAnimations(): boolean` in that order, before `interface MotionState`. Both mirror `readStoredLoadingAnimations()` with their own key; the text reader returns `false` for `null` and storage errors, the intro reader returns `true` for both.
- Extend `MotionState` with:
  - `textLoadingAnimations: boolean`
  - `setTextLoadingAnimations: (enabled: boolean) => void`
  - `landingIntroAnimations: boolean`
  - `setLandingIntroAnimations: (enabled: boolean) => void`
- Initialise the fields with their readers.
- Implement each setter by writing its own storage key inside the existing try/catch pattern, then setting state.

Leave `loadingAnimations`, its key, default, and setter untouched.

- [ ] **Step 4: Implement the two new hooks**

In `apps/frontend/src/hooks/use-motion-enabled.ts`, add:

```ts
export function useTextMotionEnabled(): boolean {
  const textLoadingAnimations = useMotionStore(
    (s) => s.textLoadingAnimations,
  );
  const reduced = useReducedMotion();
  return textLoadingAnimations && !reduced;
}

export function useLandingIntroEnabled(): boolean {
  const landingIntroAnimations = useMotionStore(
    (s) => s.landingIntroAnimations,
  );
  const reduced = useReducedMotion();
  return landingIntroAnimations && !reduced;
}
```

Do not change `useMotionEnabled()`.

- [ ] **Step 5: Run test to verify it passes**

Run from `apps/frontend`:

```bash
node --test src/store/motion-preferences.test.mjs
```

Expected: PASS, 2 tests.

- [ ] **Step 6: Typecheck**

Run from `apps/frontend`:

```bash
pnpm typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 7: Leave changes uncommitted**

Do not run `git commit`. Do not push, merge, or open a PR.

---

### Task 2: Wire scramble text and the three Appearance switches

**Files:**
- Modify: `apps/frontend/src/components/ui/RollingValue.tsx`
- Modify: `apps/frontend/src/features/settings/components/AppearanceSettingsTab.tsx`
- Modify: `apps/frontend/src/store/motion-preferences.test.mjs`

**Interfaces:**
- Consumes: `useTextMotionEnabled()` and `useLandingIntroEnabled()` from Task 1; `useMotionEnabled()` remains the gate for all other animation consumers.
- Produces: no new exports. `ScrambleText` follows the text preference only; Settings → Appearance exposes all three switches.

- [ ] **Step 1: Extend the failing test**

Append to `apps/frontend/src/store/motion-preferences.test.mjs`:

```js
const rolling = source('../components/ui/RollingValue.tsx');
const settings = source('../features/settings/components/AppearanceSettingsTab.tsx');

test('scramble text follows only the text switch', () => {
  const scrambleBody = rolling.slice(
    rolling.indexOf('export function ScrambleText'),
    rolling.indexOf('/** Short text that trades places'),
  );

  assert.match(scrambleBody, /const animate = useTextMotionEnabled\(\)/);
  assert.doesNotMatch(scrambleBody, /useMotionEnabled\(\)/);
  assert.match(scrambleBody, /if \(!animate\) return loading \? '—' : target/);
});

test('appearance exposes three independent motion switches', () => {
  assert.match(
    settings,
    /const textLoadingAnimations = useMotionStore\(\(s\) => s\.textLoadingAnimations\)/,
  );
  assert.match(
    settings,
    /const landingIntroAnimations = useMotionStore\(\(s\) => s\.landingIntroAnimations\)/,
  );
  assert.match(settings, /setTextLoadingAnimations\(e\.target\.checked\)/);
  assert.match(settings, /setLandingIntroAnimations\(e\.target\.checked\)/);
  assert.match(settings, /aria-label="Enable text loading animations"/);
  assert.match(settings, /aria-label="Enable the landing intro"/);
  assert.match(settings, /Text loading animation/);
  assert.match(settings, /Landing intro/);
  assert.match(settings, /Off by default/);
  assert.match(settings, /On by default/);
  assert.match(settings, /aria-label="Enable loading animations"/);
  assert.doesNotMatch(settings, /text decodes into place/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `apps/frontend`:

```bash
node --test src/store/motion-preferences.test.mjs
```

Expected: FAIL on the two new tests because `ScrambleText` and the settings switches have not been updated.

- [ ] **Step 3: Point `ScrambleText` at the text-only hook**

In `apps/frontend/src/components/ui/RollingValue.tsx`:

- Import `useTextMotionEnabled` from `../../hooks/use-motion-enabled` alongside the existing `useMotionEnabled` import.
- Inside `ScrambleText` only, replace `const animate = useMotionEnabled();` with `const animate = useTextMotionEnabled();`.
- Change the initial `display` state so no random glyphs are generated when animation is off:

```ts
const [display, setDisplay] = useState(() => {
  if (!animate) return loading ? '—' : target;
  return loading ? randomText(length, target) : target;
});
```

Leave `RollingNumber`, `RollingText`, and the default `RollingValue` dispatch unchanged.

- [ ] **Step 4: Add the two new Appearance switches**

In `apps/frontend/src/features/settings/components/AppearanceSettingsTab.tsx`:

- Add selectors for `textLoadingAnimations`, `setTextLoadingAnimations`, `landingIntroAnimations`, and `setLandingIntroAnimations`.
- Change the existing switch description to: `Numbers roll up from zero and brand marks animate as data arrives. Turn this off for instant values. It is automatically off when your device requests reduced motion.`
- Add two rows below it, inside the same Motion `Section`, copying the existing switch markup and using:
  - Title: `Text loading animation`
  - Description: `Random letters decode into the final text while data loads. Off by default; automatically off when your device requests reduced motion.`
  - Checkbox `aria-label`: `Enable text loading animations`
  - `checked={textLoadingAnimations}`
  - `onChange={(e) => setTextLoadingAnimations(e.target.checked)}`
  - Title: `Landing intro`
  - Description: `Play the WMSU seal splash once per tab when the landing page opens. On by default; automatically skipped when your device requests reduced motion.`
  - Checkbox `aria-label`: `Enable the landing intro`
  - `checked={landingIntroAnimations}`
  - `onChange={(e) => setLandingIntroAnimations(e.target.checked)}`

Do not rename the existing `Loading animations` switch.

- [ ] **Step 5: Run test to verify it passes**

Run from `apps/frontend`:

```bash
node --test src/store/motion-preferences.test.mjs
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Leave changes uncommitted**

Do not run `git commit`. Do not push, merge, or open a PR.

---

### Task 3: Wire the landing intro and verify

**Files:**
- Modify: `apps/frontend/src/features/landing/components/WmsuIntro.tsx`
- Modify: `apps/frontend/src/store/motion-preferences.test.mjs`

**Interfaces:**
- Consumes: `useLandingIntroEnabled()` from Task 1.
- Produces: no new exports. `WmsuIntro` follows the landing-intro preference only.

- [ ] **Step 1: Extend the failing test**

Append to `apps/frontend/src/store/motion-preferences.test.mjs`:

```js
const intro = source('../features/landing/components/WmsuIntro.tsx');

test('landing intro follows only the landing intro switch', () => {
  assert.match(
    intro,
    /import \{ useLandingIntroEnabled \} from '\.\.\/\.\.\/\.\.\/hooks\/use-motion-enabled'/,
  );
  assert.match(intro, /const motion = useLandingIntroEnabled\(\)/);
  assert.doesNotMatch(intro, /useMotionEnabled\(\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `apps/frontend`:

```bash
node --test src/store/motion-preferences.test.mjs
```

Expected: FAIL because `WmsuIntro` still uses `useMotionEnabled()`.

- [ ] **Step 3: Switch `WmsuIntro` to the landing-intro hook**

In `apps/frontend/src/features/landing/components/WmsuIntro.tsx`:

- Replace the `useMotionEnabled` import with `useLandingIntroEnabled` from the same path.
- Replace `const motion = useMotionEnabled();` with `const motion = useLandingIntroEnabled();`.

Leave the session key, hold/exit timings, skip keys, and body-scroll lock unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run from `apps/frontend`:

```bash
node --test src/store/motion-preferences.test.mjs
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Run the full verification suite**

Run from `apps/frontend`:

```bash
pnpm typecheck && pnpm test
```

Expected: typecheck clean; all tests pass, including the previous 54 plus the 5 new ones.

- [ ] **Step 6: Human smoke check**

Open Settings → Appearance and the public landing page in a fresh browser and confirm:

- Both `Loading animations` and `Text loading animation` start off; `Landing intro` starts on.
- Turning on only `Text loading animation` scrambles loading text while numbers stay instant and the intro still plays.
- Turning on only `Loading animations` rolls numbers while loading text stays `—` and the intro still plays.
- Turning off `Landing intro` suppresses the splash without affecting numbers or text.
- Reduced motion suppresses all three effects.

No browser walkthrough has been run automatically; report this as human-only if not performed.

- [ ] **Step 7: Leave changes uncommitted**

Do not run `git commit`. Do not push, merge, or open a PR.
