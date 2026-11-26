# Motion preference switches — short design

## Intent

Split the current single Motion setting into three independent browser-stored controls:

1. `Loading animations` — the existing switch, unchanged scope and default.
2. `Text loading animation` — scrambled/decode text, off by default and opt-in.
3. `Landing intro` — the WMSU seal splash on the public landing page, on by default.

The user asked for text scrambling to stop being bundled with all loading animation, and then chose a third switch rather than letting the general switch control the landing intro.

## Goals

- Keep `loadingAnimations` controlling numbers, `RollingText` title changes, brand marks, and the solver live board.
- Add `textLoadingAnimations`, default `false`, storage key `coe-nnect:text-loading-animations`; `ScrambleText` follows only this preference.
- Add `landingIntroAnimations`, default `true`, storage key `coe-nnect:landing-intro-animations`; `WmsuIntro` follows only this preference.
- Reduced-motion preference still disables all three paths.
- Settings → Appearance shows all three switches under Motion with copy that makes the split clear.

## Non-goals

- No change to number roll-up, `RollingText` title changes, brand marks, or solver live board motion.
- No backend, database, or account-wide settings change.
- No migration of existing stored values. A browser with `coe-nnect:loading-animations=true` will not automatically get text scrambling; the landing intro gets its own default-on preference.
- No change to the default of the existing `loadingAnimations` switch.

## Constraints

- `useMotionEnabled()` is already the single gate for the existing non-text, non-intro animation paths; keep it intact so those consumers are untouched.
- `ScrambleText` is imported directly by `ResponsiveTable` and `TodayScheduleStrip`, as well as through `RollingValue`; changing the hook inside `ScrambleText` covers all of them.
- `WmsuIntro` is the only landing-page consumer of the intro gate; it currently calls `useMotionEnabled()`.
- Preferences are stored per browser in `localStorage`. The two opt-in switches fail closed when storage is unavailable; the default-on landing intro fails open so a fresh browser still sees it.

## Approaches

1. **Three independent switches (chosen).** Add two store fields and two hooks; point `ScrambleText` and `WmsuIntro` at their own hooks. Trade-off: three settings to explain, but each control does exactly what its label says and no switch silently overrides another. This is what the user picked.
2. **Two switches; landing intro follows general motion.** Simpler, but turning on text would also turn on the landing intro by default, which the user rejected.
3. **Master plus sub-switches.** Keep `loadingAnimations` as a master gate. Rejected: turning the master off would still suppress text and intro, the coupling the user asked to remove.

## Decisions

- New hooks in `apps/frontend/src/hooks/use-motion-enabled.ts`:
  - `useTextMotionEnabled(): boolean` → `textLoadingAnimations && !reduced`
  - `useLandingIntroEnabled(): boolean` → `landingIntroAnimations && !reduced`
- `apps/frontend/src/store/motion.store.ts` gains `textLoadingAnimations` and `landingIntroAnimations`, their setters, and their storage keys. Defaults are `false` and `true` respectively, including when storage throws.
- `ScrambleText` in `apps/frontend/src/components/ui/RollingValue.tsx` calls `useTextMotionEnabled()`. Its initial state generates no random glyphs when animation is off.
- `WmsuIntro` in `apps/frontend/src/features/landing/components/WmsuIntro.tsx` calls `useLandingIntroEnabled()` instead of `useMotionEnabled()`.
- `apps/frontend/src/features/settings/components/AppearanceSettingsTab.tsx` gets two new switches. Existing switch copy stops claiming that text decodes. Landing intro copy states that it is on by default and skipped for reduced motion.
- New switches copy the existing switch markup exactly.

## What is left to the builder

- Implement the file changes above.
- Add source-contract checks to the existing motion test file and wire it into `pnpm test`.
- Run `pnpm typecheck` and `pnpm test` from `apps/frontend`.
- Do not commit, push, merge, or open a PR unless asked.
