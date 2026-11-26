# Prospectus sessions-per-week visibility and quick edit — short design

## Intent

The department head needs to see how many sessions per week a subject meets without opening each prospectus row, and needs to correct that number from the detail drawer without going through the full edit modal. The current Schedule tab already shows the value, but only after opening the drawer, so it is easy to miss during review.

## Goals

- Add one **Sessions/wk** column to the prospectus table showing both counts, for example `3 lec · 1 lab`.
- Add quick edit controls for **lecture sessions/week** and **lab sessions/week** in the detail drawer's Schedule tab.
- Save through the existing `PATCH /v1/prospectus/:id` endpoint, keep the drawer open, and refresh the table row.
- Keep the column and edit controls read-only when the user lacks write permission.

## Non-goals and anti-goals

- No real weekday data (`MWF`, `TTh`) and no new `days_per_week` field.
- No change to minutes per session, units, or the full Edit Placement modal's behavior.
- No backend, DTO, database migration, or PDF-import changes.
- No auto-save on every stepper click; saving stays explicit so a misclick can be discarded.

## Constraints

- `ProspectusRecord` already has `lectureSessionsPerWeek` and `labSessionsPerWeek`; `UpdateProspectusInput` is partial, so only those two fields need to be sent.
- Existing validation ranges are lecture `1–5` and lab `1–3`; the drawer controls must match them.
- `ProspectusPage.tsx` already owns cache invalidation and success/error banners. The drawer should call a page-provided callback rather than owning its own API client.
- `ProspectusDetailPanel.tsx` is currently read-only; adding local draft state there is safe as long as it resyncs when a different entry is selected.

## Approaches

1. **One combined column, two drawer steppers (chosen).** Show `3 lec · 1 lab` in a single column and put labelled steppers with a `Save changes` button in the Schedule tab. Trade-off: one extra column, but no hidden split and no modal round-trip.
2. **Two separate columns, `Lec/wk` and `Lab/wk`.** More explicit in the table, but adds another column to an already wide table and pushes Status/Actions further right.
3. **Total-only column, e.g. `4/wk`.** Narrowest, but the head would still need the drawer to see the lecture/lab split, which is the gap being fixed.

The first option was chosen because it keeps the table compact while making both counts impossible to miss.

## Decisions

- Add a `formatSessionsPerWeek(entry)` helper near `renderUnits` in `apps/frontend/src/features/prospectus/ProspectusPage.tsx`. It returns `3 lec · 1 lab`, or `—` when both values are missing/zero.
- Insert a `Sessions/wk` column immediately after `Units` in the `columns` array, using a compact table variant and the same helper for mobile cards.
- Add `onSaveSessions?: (id: string, patch: { lectureSessionsPerWeek: number; labSessionsPerWeek: number }) => Promise<void>` to `ProspectusDetailPanel`'s props.
- In `ScheduleTab`, keep local draft state for the two counts, initialized from the entry and resynced when `entry.prospectusId` changes. Show plus/minus controls bounded by the existing validation ranges.
- Show the `Save changes` button only when `canWrite`; disable it until the draft differs from the entry or while saving.
- In `ProspectusPage.tsx`, add a mutation using `updateProspectus`, show `Sessions per week updated.` on success, show the API message on failure, and call the existing `invalidateAfterProspectusChange()`.
- Preserve the existing `PatternCard` readouts for minutes and contact hours; they should reflect the saved draft after a successful save.
- Add behavior tests for the formatter and for the save payload shape. Because the drawer is TSX, a narrow source-contract check may be used only if Node cannot import the component; typecheck and a human browser check cover the wiring.

## What is left to the builder

- Implement the formatter, table column, drawer draft controls, page mutation, and callback wiring.
- Run `pnpm typecheck` and `pnpm test` from `apps/frontend`.
- Do not commit, push, merge, or open a PR unless asked.
- Report the human browser check as human-only if it is not performed.
