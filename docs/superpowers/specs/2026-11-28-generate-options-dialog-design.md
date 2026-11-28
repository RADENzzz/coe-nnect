# Generate Options Dialog — Short Design

Date: 2026-11-28

## Intent

The timetable header feels crowded. Move the `2 / 3 / 5` auto-generate option count out of the header and into a small dialog opened by **Auto-Generate**.

The multi-select bulk actions for plotted schedules are a separate, larger piece and will be designed after this one.

## Goals

- The timetable header shows only the **Auto-Generate** button, with its existing progress and disabled states.
- Clicking the enabled button opens a shared `Modal` titled **Generate options**.
- The dialog contains an accessible segmented radio group for `2 / 3 / 5`, default `3`.
- **Cancel** closes without generating and does not persist a changed count.
- **Generate** closes the dialog and starts the existing candidate generation flow with the selected count.
- The generated-options chooser, overwrite confirmation, blocked-minor path, room-deficit errors, and conflict feedback stay unchanged.
- All feedback remains global `useFeedback()`; no native dialogs or local toast state.

## Non-goals

- No backend, schema, migration, or API contract changes.
- No change to the fixed presets (`2 / 3 / 5`) or default (`3`).
- No redesign of the results chooser.
- No acknowledgement control for unplotted minors in this dialog; that remains the existing server-response-driven path.
- No multi-select/bulk row actions in this change.
- No publish or IDP changes.

## Constraints

- Candidate mode stays the default path. Legacy single API stays for compatibility/tests only.
- Closing the chooser without accepting still writes nothing and leaves live drafts untouched.
- The existing Browser E2E spec is authoritative. Its count-selection step must move from the header `<select>` to the dialog radio control.

## Approaches

- **A — Small generate dialog (chosen).** Removes the header control completely and puts the count next to the action it affects. Costs one extra click before generation. Best fit for the stated crowding problem.
- **B — Count inside the results chooser.** Would make the results screen busier and require regeneration when the count changes. Rejected.
- **C — Split button in the header.** Smaller code change but leaves the control in the crowded header and is not a dialog. Rejected.

## Implementation shape

1. Add `AutoGenerateOptionsDialog.tsx` beside `AutoScheduleCandidateChooser`.
   - Uses shared `Modal` with title **Generate options**.
   - Owns a local draft count initialized from the page count.
   - Renders native radio inputs visually styled as `2 / 3 / 5` segmented options, grouped under the accessible label **Number of schedule options to generate**.
   - Footer: **Cancel** and **Generate**.
   - Escape/backdrop dismissal is allowed because nothing has been written at this point.

2. Simplify `AutoGenerateButton`.
   - Remove the `Options` label, `<select>`, and count props.
   - Keep the existing progress meter, disabled reason, and button styling.
   - Its click now opens the dialog instead of starting generation.

3. Update `TimetablePage`.
   - Add `generateDialogOpen` state.
   - `handleAutoGenerate` becomes the dialog-open handler, preserving the no-sections guard and existing disabled behavior.
   - Add `handleConfirmGenerate(count)`: set `candidateCount` for the next run, close the dialog, then call `performAutoGenerate({ candidateCount: count })`.
   - Extend `performAutoGenerate` with an optional `candidateCount` override so the just-selected value is used immediately instead of waiting for a React state re-render.

4. Update tests.
   - Frontend source-contract tests: button no longer renders the count selector; dialog owns the radio group; page wiring opens/closes dialog and passes the selected count.
   - E2E: select the count inside **Generate options**, then click **Generate** before waiting for the generation response.
   - Keep all existing assertions about non-destructive generation and accept-time writes.

## Builder latitude

- Exact Tailwind classes for the segmented radios and modal width are implementation details.
- Whether the dialog uses `Modal size="sm"` or `size="md"` is a visual call; keep it small enough that it does not compete with the results chooser.
- Keep accessible names and button labels stable so E2E selectors stay simple.

## Verification

- Focused frontend auto-generate contract tests.
- `pnpm test`, `pnpm typecheck`, `pnpm typecheck:e2e`.
- `pnpm test:e2e:list`.
- CI Browser E2E is authoritative; local browser E2E remains skipped because the local env points at a dead Supabase project.
