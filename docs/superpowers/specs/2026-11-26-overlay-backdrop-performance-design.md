# Design: overlay backdrop performance

Date: 2026-11-26  
Status: revised — awaiting approval after scope change

## Intent

Modal, dialog, drawer, chat, and notification overlays feel laggy when the browser is not using hardware-accelerated graphics. The user wants non-glass themes to open and close smoothly while the glass theme keeps its frosted overlay look. Investigation shows the dark tint is cheap; the expensive part is an unconditional full-viewport `backdrop-filter: blur(...)` applied to the dim layer.

## Findings

- `apps/frontend/src/components/ui/modal-backdrop.ts` adds `backdrop-blur-sm` to every shared `Modal` backdrop by default.
- `ChatDrawer.tsx:303` and `NotificationBell.tsx:160` independently add full-screen `backdrop-blur-[2px]`; these are the matched chat/inbox surfaces the user mentioned.
- Bottom sheets, login/system dialogs, detail panels, and several custom modals repeat the same full-screen blur pattern.
- The backdrop animation is already opacity-only (`backdrop-in`, 200ms) and panel motion is transform/opacity. Those are compositor-friendly.
- The glass theme is driven by `html.glass` in `appearance.store.ts:430`, so overlay blur can be gated in CSS without adding runtime state.

## Goals

- Remove unconditional `backdrop-filter` from every overlay dim layer.
- Keep overlay blur **only** when `html.glass` is active.
- Preserve the two existing blur strengths: 4px for shared modals and 2px for chat/inbox/sheets/detail panels.
- Keep the dark tint, opacity-only fade, and existing panel entrance motion unchanged.
- Cover generic modals/dialogs, bottom sheets, detail panels/drawers, login/system dialogs, chat, and the notification bell/inbox.
- Keep the change source-testable and uncommitted.

## Non-goals

- Do not remove the dark tint or reduce legibility/separation.
- Do not change panel sizing, placement, z-index, focus handling, or body scroll lock.
- Do not add exit animations or rewrite animation libraries.
- Do not change `html.glass` card/sidebar blur, `liquid-blob`, tour spotlight/popover, sticky-header blur, or other decorative frosted surfaces.
- Do not add a new user-facing setting; the existing glass preference is the gate.

## Constraints

- The repository has no React DOM render harness; regression coverage will be source-level plus the existing full test/typecheck/build gates.
- All work stays uncommitted, consistent with the current checkout.
- Reduced-motion behavior must keep working; this change moves a filter behind a theme gate rather than adding motion.
- Tailwind must not tree-shake the new conditional rules, so they belong in `globals.css` outside a utility-only layer, alongside the existing `html.glass` rules.

## Approaches considered

### 1. Remove blur from overlay backdrops everywhere

Keep `bg-black/...` and animate only opacity. Delete `backdrop-blur-*` from all overlay layers.

- Cost: glass theme loses the frosted overlay look.
- Benefit: fastest on every theme.

### 2. Keep blur but stop animating it

Leave the static blur and remove only the backdrop opacity animation.

- Cost: the full-screen filter still has to be recomposited whenever content underneath changes.
- Benefit: smallest visual change.

### 3. Gate overlay blur on the glass theme — selected

Replace unconditional Tailwind blur utilities with marker classes. Add `html.glass` CSS rules that apply the old 2px/4px blur only in glass theme.

- Cost: users who enable glass theme still get the same overlay blur cost; this does not make glass-theme modals fast.
- Benefit: default/non-glass themes become smooth while glass theme keeps its intended frosted dialogs.

## Chosen design

Approach 3. The builder should:

1. Change `getModalBackdropClassName()` so it always returns `absolute inset-0 bg-black/60 animate-backdrop-in overlay-backdrop-blur-sm`, with no Tailwind blur utility.
2. Remove the obsolete `blurBackdrop` prop from `Modal` and its two callers that pass `false`.
3. Replace direct `backdrop-blur-[2px]` classes with `overlay-backdrop-blur-xs` and direct `backdrop-blur-sm` classes with `overlay-backdrop-blur-sm` in:
   - `BottomSheet.tsx`
   - `ChatDrawer.tsx`
   - `NotificationBell.tsx`
   - `LoginPage.tsx`
   - `SystemStatusBanner.tsx`
   - `ScheduleDetailDrawer.tsx`
   - `StackPicker.tsx`
   - `PlotSubjectModal.tsx`
   - `SolverLiveBoard.tsx`
   - `GifCard.tsx`
   - `PdfCanvas.tsx`
   - `UserDetailDrawer.tsx`
   - faculty/room/subject/prospectus detail panels and `UserDrawer.tsx`
   - In `UserDetailDrawer.tsx`, change only the full-screen scrim at line 75; leave the avatar's decorative blur at line 102 unchanged.
4. Keep each layer's existing `bg-black/...`, `animate-backdrop-in`, and panel motion unchanged.
5. Add `html.glass .overlay-backdrop-blur-xs { backdrop-filter: blur(2px) }` and `html.glass .overlay-backdrop-blur-sm { backdrop-filter: blur(4px) }` in `globals.css`, each with the `-webkit-` prefix too.
6. Update/add source-level regression tests so:
   - the shared helper includes the marker class and no `backdrop-blur-*` utility;
   - every named overlay file has no literal `backdrop-blur-*` class and uses the correct marker;
   - `globals.css` contains both `html.glass`-scoped blur rules.
7. Run frontend typecheck/tests/build and root typecheck/tests. Report the pre-existing chunk-size warning as such.
8. Leave all changes uncommitted and ask for a human browser smoothness check in both non-glass and glass themes; automated source tests cannot measure real frame rate.

## Acceptance

- No overlay dim layer in the listed files contains an unconditional `backdrop-blur-*` utility.
- Non-glass themes render the dim scrim with no `backdrop-filter`.
- Glass theme keeps 2px/4px overlay blur via `html.glass` CSS rules.
- Modal/chat/inbox overlays still dim the page and animate with opacity.
- Panel entrance motion still uses transform/opacity and remains unchanged.
- All automated gates pass; no commits are created.
