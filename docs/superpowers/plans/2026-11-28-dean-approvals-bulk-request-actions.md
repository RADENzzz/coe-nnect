# Dean Schedule Approvals Bulk Request Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pending-only multi-select and bulk Approve/Reject to the dean Schedule Approvals request tabs, apply the Department filter there too, and preserve the existing schedule bulk actions and approval constraints.

**Architecture:** Extract small pure helpers for request keys, pending eligibility, request filtering, kind breakdowns, and result messages. Consume those helpers from `DeanApprovalsPage.tsx`, extend its existing selection state and confirmation modal, and fan out decisions through the three existing request response APIs with `Promise.allSettled`.

**Tech Stack:** React 18, TypeScript, TanStack Query, React Router search params, Node test runner, Tailwind classes.

**Spec:** `docs/superpowers/specs/2026-11-28-dean-approvals-bulk-request-actions-design.md`

## Global Constraints

- Use global `useFeedback()` only; no `alert`, `confirm`, `prompt`, local toast, or local success/failure state.
- No direct publish and no bulk IDP action. Bulk publish means bulk-approving selected Publish requests.
- Request selection is limited to rows with `status === 'pending'`.
- Request selection keys are `${kind}:${requestId}`; schedule selection keys remain raw `scheduleId`.
- Department filter must render and take effect on request tabs as well as schedule tabs.
- Preserve `?request=`, `?publishRequest=`, `?changeRequest=`, `?status=`, `?deptFilter=`, active-term behavior, drawer decisions, and every existing `data-tour` value.
- CI Browser E2E is authoritative; do not run local browser E2E.
- Use `prettier --single-quote` if formatting; do not run default Prettier.
- Commit subjects must not use `feat` or `chore`, must not end with `:`, and include `Co-authored-by: trynotybort <trynotybort@gmail.com>`.
- Do not stage `.superpowers/`, `final-review.diff`, unrelated docs plans/specs, or `docs/integrations/idp-request-change-update.md`.

## Review Focus

- Mixed-kind request selection: confirmation copy must name each selected kind and count, and each row must call its own endpoint — pinned by Task 1 `requestKindBreakdown` tests and Task 3 source-wiring test.
- Resolved or stale requests: only pending rows may be selected and acted on — pinned by Task 1 `isPendingRequest` test and Task 2 source-wiring test.
- Department filter on request tabs: it must filter by `request.deptId ?? request.schedule?.deptId` and keep `Showing n of m` correct — pinned by Task 1 `filterRequestRows` test and Task 2 source-wiring test.
- Partial batch failure: successful keys leave selection, failed keys stay selected, and feedback reports both counts plus the first error — pinned by Task 1 `requestDecisionResultMessage` test and Task 3 source-wiring test.
- Preserved constraints: no direct publish, no bulk IDP, deep links intact, `data-tour` values unchanged — pinned by Task 3 updated `schedule-publish-approvals.test.ts` assertions.

---

## File Structure

- Create `apps/frontend/src/features/dean/dean-request-bulk.ts`: pure request-row helpers and shared types.
- Create `apps/frontend/src/features/dean/dean-request-bulk.test.ts`: helper and source-wiring tests.
- Modify `apps/frontend/package.json`: add the new test file to the frontend `test` script.
- Modify `apps/frontend/src/features/dean/DeanApprovalsPage.tsx`: consume helpers, request selection, request bulk bar, confirmation, and decision fan-out.
- Modify `apps/frontend/src/features/dean/schedule-publish-approvals.test.ts`: update the schedule-only bulk-bar assertion and add request-bulk assertions.

---

### Task 1: Request helper module

**Files:**
- Create: `apps/frontend/src/features/dean/dean-request-bulk.ts`
- Create: `apps/frontend/src/features/dean/dean-request-bulk.test.ts`
- Modify: `apps/frontend/package.json`
- Modify: `apps/frontend/src/features/dean/DeanApprovalsPage.tsx`

**Interfaces:**
- Consumes: `SchedulePublishRequest`, `ScheduleUnfinalizeRequest`, `ScheduleChangeRequest` from `apps/frontend/src/api/*`.
- Produces:
  - `RequestStatusFilter = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'all'`
  - `RequestRow` union of `{ kind: 'publish' | 'unfinalize' | 'change'; request: ... }`
  - `REQUEST_KIND_LABELS: Record<RequestRow['kind'], string>`
  - `requestSelectionKey(row: RequestRow): string`
  - `isPendingRequest(row: RequestRow): boolean`
  - `filterRequestRows(rows: RequestRow[], status: RequestStatusFilter, query: string, deptFilter: string): RequestRow[]`
  - `requestKindBreakdown(rows: RequestRow[]): string`
  - `requestDecisionResultMessage(decision: 'approve' | 'reject', succeeded: number, failures: number, error?: string): string`

- [ ] **Step 1: Write the failing helper tests**

Create `dean-request-bulk.test.ts` using `node:assert/strict` and `node:test`. Use minimal request fixtures with `requestId`, `deptId`, `status`, `note`, `reason`, and optional `schedule.subject`.

Assert:

```ts
assert.equal(requestSelectionKey({ kind: 'publish', request: { requestId: 'r1' } } as RequestRow), 'publish:r1');
assert.equal(requestSelectionKey({ kind: 'change', request: { requestId: 'r1' } } as RequestRow), 'change:r1');
assert.equal(isPendingRequest({ request: { status: 'pending' } } as RequestRow), true);
assert.equal(isPendingRequest({ request: { status: 'approved' } } as RequestRow), false);
```

Assert `filterRequestRows`:
- status `'all'` keeps pending and approved rows.
- status `'pending'` drops approved rows.
- query `'csc'` matches subject code case-insensitively and query `'zzz'` matches nothing.
- `deptFilter: '2'` keeps only rows where `request.deptId` or `request.schedule?.deptId` is `'2'`.

Assert:

```ts
assert.equal(requestKindBreakdown([
  { kind: 'publish' } as RequestRow,
  { kind: 'publish' } as RequestRow,
  { kind: 'change' } as RequestRow,
]), '2 Publish, 1 Change');
assert.equal(requestDecisionResultMessage('approve', 2, 0), 'Approved 2 requests.');
assert.equal(requestDecisionResultMessage('reject', 1, 0), 'Rejected 1 request.');
assert.equal(
  requestDecisionResultMessage('approve', 2, 1, 'Request is stale.'),
  '2 succeeded, 1 failed. Request is stale.',
);
```

Add `src/features/dean/dean-request-bulk.test.ts` to the `test` script in `apps/frontend/package.json` next to the existing dean tests.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/dean/dean-request-bulk.test.ts`

Expected: FAIL because `dean-request-bulk.ts` does not exist.

- [ ] **Step 3: Implement the helper module**

In `dean-request-bulk.ts`, define the exported types and constants listed in Interfaces. Implement each function as follows:
- `requestSelectionKey`: return `${row.kind}:${row.request.requestId}`.
- `isPendingRequest`: return `row.request.status === 'pending'`.
- `filterRequestRows`: apply status first, then query against `schedule.subject.subjectCode` and `schedule.subject.title`, then department against `request.deptId ?? request.schedule?.deptId`.
- `requestKindBreakdown`: count by `REQUEST_KIND_LABELS[row.kind]` and join as `2 Publish, 1 Change` in publish, unfinalize, change order.
- `requestDecisionResultMessage`: no failures returns `Approved/Rejected ${n} request(s).`; failures returns `${succeeded} succeeded, ${failures} failed. ${error ?? ''}`.trim().

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/dean/dean-request-bulk.test.ts`

Expected: PASS.

- [ ] **Step 5: Make `DeanApprovalsPage.tsx` consume the shared types and filter**

Remove the local `RequestStatusFilter`, `RequestRow`, `REQUEST_KIND_LABELS`, and `filterRequestRows` definitions. Import them from `./dean-request-bulk`. Change the `filterRequestRows(...)` call to pass `deptFilter` as the fourth argument. Keep all other behavior unchanged.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm typecheck`

Expected: PASS.

Commit the spec, plan, helper, test, package script change, and page import changes:

```bash
git add docs/superpowers/specs/2026-11-28-dean-approvals-bulk-request-actions-design.md docs/superpowers/plans/2026-11-28-dean-approvals-bulk-request-actions.md apps/frontend/src/features/dean/dean-request-bulk.ts apps/frontend/src/features/dean/dean-request-bulk.test.ts apps/frontend/package.json apps/frontend/src/features/dean/DeanApprovalsPage.tsx
git commit -m "Add dean request bulk action helpers" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

---

### Task 2: Request selection and department filter UI

**Files:**
- Modify: `apps/frontend/src/features/dean/DeanApprovalsPage.tsx`
- Test: `apps/frontend/src/features/dean/dean-request-bulk.test.ts`

**Interfaces:**
- Consumes: `requestSelectionKey`, `isPendingRequest`, `filterRequestRows` from Task 1.
- Produces: `effectiveSelectedRequestRows: RequestRow[]` and `effectiveSelectedRequestKeys: Set<string>` used by Task 3.

- [ ] **Step 1: Write the failing source-wiring test**

Append a source-wiring test to `dean-request-bulk.test.ts` that reads `apps/frontend/src/features/dean/DeanApprovalsPage.tsx` and asserts:

```ts
assert.match(source, /rowKey=\{\(row\) => requestSelectionKey\(row\)\}/);
assert.match(source, /isRowSelectable=\{isPendingRequest\}/);
assert.match(source, /selectedKeys=\{effectiveSelectedRequestKeys\}/);
assert.match(source, /onSelectionChange=\{setSelectedIds\}/);
assert.match(source, /filterRequestRows\(requestRowsByTab, requestStatusFilter, searchQuery, deptFilter\)/);
assert.match(source, /Department/);
assert.doesNotMatch(source, /<div className="min-w-\[160px\]">\s*<label[^>]*>Request status/);
```

The last assertion is intentionally fragile only around the current request-tab branch; update it if the implementation moves the Request status control while keeping Department on request tabs.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/dean/dean-request-bulk.test.ts`

Expected: FAIL on the new source-wiring assertions.

- [ ] **Step 3: Wire request selection**

In `DeanApprovalsPage.tsx`:
- Add `effectiveSelectedRequestRows` by filtering `filteredRequests` with `selectedIds.has(requestSelectionKey(row))`.
- Add `effectiveSelectedRequestKeys` as a `Set` of those keys.
- Pass `selectable`, `selectedKeys={effectiveSelectedRequestKeys}`, `onSelectionChange={setSelectedIds}`, `isRowSelectable={isPendingRequest}`, and `rowKey={(row) => requestSelectionKey(row)}` to the request `ResponsiveTable`.
- Keep `onRowClick` opening the drawer and keep the existing `data-tour="dean-approvals-table"` wrapper.
- Selection is already cleared on tab change; derived effective keys prune request selections when filters or query data change.

- [ ] **Step 4: Show Department on every tab**

Move the Department dropdown JSX out of the schedule-only fragment so it renders for both `isRequestTab` and schedule tabs. Keep Request status only on request tabs and Status / Section / Faculty only on schedule tabs. Keep `hasAnyFilter`, `clearFilters`, and the `Showing n of m` count using `filteredRequests` on request tabs.

- [ ] **Step 5: Run the focused test and typecheck**

Run:

```bash
pnpm --filter @coe-nnect/frontend exec node --test src/features/dean/dean-request-bulk.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/dean/DeanApprovalsPage.tsx apps/frontend/src/features/dean/dean-request-bulk.test.ts
git commit -m "Add request selection and department filter to dean approvals" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

---

### Task 3: Bulk request decisions

**Files:**
- Modify: `apps/frontend/src/features/dean/DeanApprovalsPage.tsx`
- Test: `apps/frontend/src/features/dean/schedule-publish-approvals.test.ts`
- Test: `apps/frontend/src/features/dean/dean-request-bulk.test.ts`

**Interfaces:**
- Consumes: `effectiveSelectedRequestRows`, `effectiveSelectedRequestKeys`, `requestKindBreakdown`, `requestDecisionResultMessage`.
- Produces: `performRequestDecision(decision: RequestDecision, rows: RequestRow[], remarks?: string): Promise<void>`, `RequestDecision = 'approve' | 'reject'`.

- [ ] **Step 1: Write/update failing source-wiring tests**

Update `schedule-publish-approvals.test.ts`:
- Replace the assertion `assert.match(source, /activeTab !== 'review' && activeTab !== 'finalized' && activeTab !== 'all'/);` with assertions that the schedule-only condition still exists and the request bulk bar exists:

```ts
assert.match(source, /isRequestTab \? \(/);
assert.match(source, /Bulk request actions/);
assert.match(source, /Approve \{effectiveSelectedRequestKeys\.size\}/);
assert.match(source, /Reject \{effectiveSelectedRequestKeys\.size\}/);
```

- Keep existing assertions that no `BatchAction` includes `'publish'`, no `action === 'publish'`, no `Publish {selectedFinalizedCount}`, and `sendActiveTermToIdp` remains.

Append to `dean-request-bulk.test.ts` source assertions that `DeanApprovalsPage.tsx` contains:

```ts
assert.match(source, /respondToPublishRequest/);
assert.match(source, /respondToUnfinalizeRequest/);
assert.match(source, /respondToChangeRequest/);
assert.match(source, /type RequestDecision = 'approve' \| 'reject'/);
assert.match(source, /const performRequestDecision = useCallback/);
assert.match(source, /Promise\.allSettled/);
assert.match(source, /requestDecisionResultMessage/);
assert.match(source, /Remarks \(required\)/);
assert.doesNotMatch(source, /window\.confirm/);
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
pnpm --filter @coe-nnect/frontend exec node --test src/features/dean/dean-request-bulk.test.ts src/features/dean/schedule-publish-approvals.test.ts
```

Expected: FAIL on the new assertions.

- [ ] **Step 3: Add request decision imports and confirmation state**

In `DeanApprovalsPage.tsx`:
- Import `respondToPublishRequest`, `respondToUnfinalizeRequest`, `respondToChangeRequest`.
- Import `requestKindBreakdown` and `requestDecisionResultMessage`.
- Define `type RequestDecision = 'approve' | 'reject'`.
- Extend `PendingConfirmation` with a request branch:

```ts
| { action: 'request-decision'; decision: RequestDecision; rows: RequestRow[]; remarks?: string; itemCount: number }
```

- Add `requestDecisionPending` state to disable bulk buttons while a batch runs.

- [ ] **Step 4: Implement `performRequestDecision`**

Implement with signature:

```ts
const performRequestDecision = useCallback(
  async (decision: RequestDecision, rows: RequestRow[], remarks?: string): Promise<void> => { ... },
  [feedback, qc],
);
```

Behavior:
- For each row call the matching API: publish → `respondToPublishRequest(requestId, decision, remarks)`, unfinalize → `respondToUnfinalizeRequest`, change → `respondToChangeRequest`.
- Use `Promise.allSettled` over `rows`.
- Invalidate `['schedule-publish-requests']`, `['schedule-unfinalize-requests']`, and `['schedule-change-requests']`.
- Remove only fulfilled `requestSelectionKey(row)` values from `selectedIds`; failed rows remain selected.
- Call `requestDecisionResultMessage` and send it to `feedback.success` when no failures, otherwise `feedback.failed`.

- [ ] **Step 5: Wire confirmation and bulk bar**

- Extend `getConfirmCopy` to accept the request-decision branch. For request decisions, title is `Approve/Reject ${n} requests?`, body includes `Selected: ${requestKindBreakdown(rows)}.`, confirm label is `Approve ${n}` / `Reject ${n}`, and reject tone is `danger`.
- For reject confirmations, render a required textarea labelled `Remarks (required)` with `maxLength={500}` and disable the confirm button until `remarks.trim()` is non-empty.
- `handleConfirm` calls `performRequestDecision` for the request branch and the existing `performAction` for schedule branches.
- Add a request bulk bar on request tabs when `effectiveSelectedRequestKeys.size > 0`, with `role="toolbar"`, `aria-label="Bulk request actions"`, buttons `Approve ${effectiveSelectedRequestKeys.size}`, `Reject ${effectiveSelectedRequestKeys.size}`, and `Clear selection`. Disable both decision buttons while `requestDecisionPending`.
- Keep the schedule bulk bar unchanged on schedule tabs.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
pnpm --filter @coe-nnect/frontend exec node --test src/features/dean/dean-request-bulk.test.ts src/features/dean/schedule-publish-approvals.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/dean/DeanApprovalsPage.tsx apps/frontend/src/features/dean/schedule-publish-approvals.test.ts apps/frontend/src/features/dean/dean-request-bulk.test.ts
git commit -m "Add bulk request decisions to dean approvals" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

---

### Task 4: Verify and publish

**Files:**
- No new product files expected. Change only if verification finds a defect.

**Interfaces:**
- Consumes: Tasks 1–3.

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm typecheck
pnpm typecheck:e2e
pnpm test
pnpm test:e2e:list
```

Expected: all pass; E2E discovery lists 25 tests. No local browser E2E run.

- [ ] **Step 2: Review the diff**

Run:

```bash
git diff --check
git status --short
git log --oneline -5
```

Expected: no whitespace errors; no `.superpowers/`, `final-review.diff`, or unrelated docs staged; only this feature's commits ahead of the base.

- [ ] **Step 3: Report completion**

Report the commits, test results, and that CI Browser E2E remains the authoritative check. Do not merge or push unless the human partner has chosen that step.
