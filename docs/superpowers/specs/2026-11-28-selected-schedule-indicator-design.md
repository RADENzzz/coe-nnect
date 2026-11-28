# Selected schedule indicator design

Date: 2026-11-28

## Intent

The bulk-selection flow hides checkboxes after the first tick and relies on an outline to show which timetable rows are selected. In the grid, that outline disappears exactly when a row is selected: `ClassBlock` is focusable (`tabIndex={0}`) and has `focus:outline-none`, whose `:focus` specificity overrides the base selected outline utilities. The agenda outline survives but is only a thin 2px line.

## Goals

- Selected grid and agenda rows show a clearly visible primary outline for the whole time they are selected.
- The indicator survives both pointer selection and keyboard focus.
- Keyboard users still get the existing white `focus-visible:ring`.
- The selected grid block draws above adjacent blocks so the offset outline is not hidden.

## Non-goals

- No changes to selection state, status locking, bulk actions, feedback messages, deep links, or tours.
- No new component, modal, or local state.
- No backend, schema, or endpoint work.

## Constraints

- Frontend-only Tailwind class and inline-style changes.
- Keep the existing `primary` token and all current `data-tour` values.
- Use the existing source-regex test file; CI Browser E2E remains authoritative and local browser E2E stays skipped because `e2e/.env.local` points at a dead Supabase project.
- Commit subjects must not use `feat` or `chore`, must not end with `:`, and include `Co-authored-by: trynotybort <trynotybort@gmail.com>`.

## Approaches considered

1. **Unhide the existing 2px outline only.** Smallest diff, but the outline can still be covered by neighboring blocks and is easy to miss on packed colored cards.
2. **Persistent 3px primary outline with a 2px offset and raised selected z-index (chosen).** Clearly legible in grid and agenda, survives focus, and does not disturb existing conflict/diff rings.
3. **Use `ring` or a custom `box-shadow` instead of `outline`.** Rejected because `ClassBlock` already uses `ringClass` for conflict/diff tones and focus uses a ring; stacking multiple box-shadow utilities would fight for the same property.

## Decisions

- Remove `focus:outline-none` from both `ClassBlock` variants; keep `focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-white focus-visible:ring-offset-surface-container-lowest`.
- Replace the selected class with `outline outline-[3px] outline-primary outline-offset-2` in both `ClassBlock` variants and `AgendaClassCard`.
- In `ClassBlock` inline styles, set `zIndex: dragging ? 9999 : selected ? 3 : 1` so a selected block sits above its neighbors but dragging still wins.
- In `AgendaClassCard`, add `relative z-10` with the selected outline so the offset outline can draw above adjacent cards.

## Implementation notes for the builder

- The focus override is in `apps/frontend/src/features/timetable/components/ClassBlock.tsx` at the two `clsx(...)` blocks; both contain `focus:outline-none` and `selected && 'outline outline-2 outline-primary'`.
- Update `apps/frontend/src/features/timetable/views/AgendaClassCard.tsx` outer wrapper class list the same way.
- Add source assertions to `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts` using the already-defined `classBlock` and `agendaCard` sources.
- Do not change `tours.ts`, tour copy, `globals.css`, bulk-action behavior, or any other component.
