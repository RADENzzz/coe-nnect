# Contextual bulk actions and header tidy-up — design

Status: proposed (awaiting approval)

Extends: `docs/superpowers/specs/2026-11-28-multi-select-bulk-actions-design.md`

## Intent and why

The bulk bar works, but it treats every selection the same. A head who selects a mix of drafts, review rows, and finalized rows has to remember which actions apply. The top header has also grown crowded as Clear auto-drafts joined Auto-Generate, Focus Plot, Versions, and Plot Subject.

This change makes the selection bar report the status mix and offer the actions that apply to that mix. It also reduces header noise by keeping only the two primary actions visible and moving the rest into a More menu.

## Goals

- Show a status breakdown in the selection bar: `N selected · d draft · r review · f finalized`.
- Add **Cancel finalization** for selected `finalized` rows.
- Add **Request change** for selected `review` or `finalized` rows, using one shared reason for the batch.
- Act on the eligible subset of a mixed selection and report skipped rows in global feedback.
- Keep Delete, Review, Finalize, Request publish, and Clear selection behavior unchanged.
- Move Versions, Clear auto-drafts, and Focus Plot into a header **More** menu; keep Auto-Generate and Plot Subject visible.
- Preserve existing tours, deep links, publication gating, and IDP behavior.

## Non-goals

- No published-row actions in the bar; **Request unfinalize** stays on the detail drawer.
- No direct publish and no IDP action.
- No backend, schema, migration, or bulk endpoint changes.
- No change to which rows are editable or to the draft-only overwrite rule.
- No native `alert`, `confirm`, or `prompt`; no local toast or success/failure state.

## Constraints

- Existing single-row APIs are the only action paths:
  - `updateScheduleStatus(id, 'draft')` for Cancel finalization. The backend already cancels pending publish requests when leaving Finalized.
  - `createChangeRequest(id, reason)` for Request change. The backend allows only `review`/`finalized` rows, requires a 5–500 character reason, rejects duplicate pending requests, and keeps approval with the Dean.
- Published rows remain unselectable, and a DH cannot pull them back directly through `updateScheduleStatus`.
- `useFeedback()` remains the only result channel.
- Bulk handlers must not read or write search params.
- CI Browser E2E remains authoritative; local browser E2E stays skipped because `e2e/.env.local` targets a dead Supabase project.

## Approaches

1. **Extend the existing frontend fan-out — chosen.** Add the two actions to `bulk-actions.util.ts` and `useBulkScheduleActions.ts`, extend the bar and confirmation modal, and add a small header More menu. This reuses the proven partial-failure path and needs no backend contract.
2. **Add a backend bulk endpoint.** One atomic request would be possible, but it needs controller/service/DTO changes and conflicts with the no-new-endpoint constraint.
3. **Status-dominant bar.** Show one primary action based on the majority status. It would reduce button count but hide valid actions in mixed selections, which is the opposite of the requested clarity.

## Decisions

### Eligibility and fan-out

- Add `cancel-finalization`: eligible statuses `finalized`; calls `updateScheduleStatus(id, 'draft')`. No confirmation modal; it is a direct, reversible status change like Review and Finalize.
- Add `request-change`: eligible statuses `review` and `finalized`; calls `createChangeRequest(id, reason)`.
- Reuse `Promise.allSettled`. Successful IDs leave the selection; failed IDs stay selected for retry.
- When a clicked action has eligible rows but the selection also contains skipped rows, feedback must say how many were skipped, e.g. `Updated 2 selected rows; 1 skipped.` When no row is eligible, keep the existing error and selection unchanged.
- Invalidation stays with the hook's current dependent-query list; Request change additionally relies on `['schedule-change-requests']`, already in that list.

### Selection bar

- Compute status counts from the currently selected `ScheduleEntry` rows and render them beside the count.
- Show **Cancel finalization** only when at least one selected row is `finalized`.
- Show **Request change** only when at least one selected row is `review` or `finalized`.
- Keep the existing buttons visible under their current rules. Buttons remain disabled while any bulk action is pending.
- Do not add a status-dominant mode; mixed selections show all applicable actions.

### Confirmation modal

- Generalize the existing note field to serve both Request publish and Request change.
- Request publish keeps its optional 0–500 character note.
- Request change uses a required 5–500 character reason, mirroring `RequestChangeModal`, with a shared reason applied to every eligible row.
- Clear auto-drafts keeps the action-specific draft-count copy from the previous task.

### Header

- Keep visible: entry count/coverage, Auto-Generate, and Plot Subject.
- Add a **More ▾** button containing Versions, Clear auto-drafts, and Focus Plot, each rendered only when it would previously have been visible.
- Use an accessible menu button: `aria-haspopup="menu"`, `aria-expanded`, Escape closes, outside click closes, and menu items remain keyboard reachable.
- Preserve existing `data-tour` attributes on the moved controls so tours still target them.

### Deep links and safety

- Bulk handlers and the More menu do not navigate or touch `?request=`, `?publishRequest=`, `?changeRequest=`, `?newTerm=1`, or `?termId=…`.
- The More menu is local UI state only.

## Tests

- Utility tests for the two new status sets and mixed-selection eligibility.
- Hook source assertions for both new APIs, skipped-count feedback, shared reason, global feedback, and unchanged invalidation keys.
- Bar source assertions for status chips and contextual button visibility.
- Modal assertions for the shared reason field and the 5-character rule.
- Page assertions for More menu contents and accessibility attributes.
- Confirm `pnpm typecheck`, `pnpm typecheck:e2e`, `pnpm test`, and `pnpm test:e2e:list` pass. CI Browser E2E remains authoritative.
