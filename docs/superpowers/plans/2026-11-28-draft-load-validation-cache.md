# Draft Load Validation Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse identical catalog and term-level lookups across all rows in one saved-draft preflight/apply validation so large drafts do not exceed the browser's 30-second API timeout.

**Architecture:** Add an optional request-scoped cache to `RuleContextBuilder.build()` and memoize each existing loader by its current query key. `TermDraftSnapshotService.assess()` creates one cache per assessment and passes it to every row build; other callers keep the uncached path.

**Tech Stack:** NestJS, TypeScript, TypeORM, Supabase JS, Jest, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-28-draft-load-validation-cache-design.md`

## Global Constraints

- Only draft/review rows may be saved, loaded, or removed.
- Finalized/published rows are never written, deleted, or created.
- Any live editable row with `pendingFacultyRequestId` blocks load and is never cancelled.
- Snapshots remain locked to their original term.
- Active term and department id are required for draft endpoints.
- Preflight and preview are read-only.
- Load remains all-or-nothing.
- No native `alert`, `confirm`, or `prompt`; global `useFeedback()` only.
- Every existing `data-tour` value stays unchanged, especially `tt-focus`.
- CI Browser E2E is authoritative; do not run local browser E2E.
- Commit subjects must not use `feat` or `chore`, must not end with `:`, and include `Co-authored-by: trynotybort <trynotybort@gmail.com>`.

## Review Focus

- Repeated subject/faculty/room/section lookups in one request must issue one query each — covered by Task 1 builder cache test.
- Repeated term/day schedule and commitment lookups must not change exclusion semantics — covered by Task 1 existing exclusion tests plus cache-key assertions.
- Repeated term-wide config/restriction lookups must be shared only inside one request — covered by Task 1 config count test and Task 2 shared-cache identity test.
- A different day, faculty id, term, or exclusion list must not collide in the cache — covered by Task 1 cache-key assertions.
- Other `RuleContextBuilder` callers must remain uncached — covered by Task 1 no-cache build test.

---

### Task 1: Add request-scoped cache to `RuleContextBuilder`

**Files:**
- Modify: `apps/backend/src/modules/scheduling/services/rule-context.builder.ts`
- Test: `apps/backend/test/rule-context-auto-draft-exclusion.spec.ts`

**Interfaces:**
- Consumes: existing private loaders and `BuildContextInput`.
- Produces: exported `RuleContextCache`, exported `createRuleContextCache(): RuleContextCache`, and optional `cache?: RuleContextCache` on `BuildContextInput`.

- [ ] **Step 1: Write failing builder cache tests**

Add tests to `apps/backend/test/rule-context-auto-draft-exclusion.spec.ts` that:
  - extend the Supabase mock to count calls to `from('scheduling_setting')`, `from('subject')`, and `from('section')`;
  - call `builder.build(inputWithSharedCache)` twice with the same `createRuleContextCache()` object and assert those three table counts are each `1`;
  - build once with different `dayOfWeek` values using the same cache and assert two `schedule` queries with distinct `day_of_week` filters;
  - call `builder.build(inputWithoutCache)` twice and assert the config table is queried twice.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @coe-nnect/backend test -- --runInBand test/rule-context-auto-draft-exclusion.spec.ts`
Expected: FAIL because `createRuleContextCache` and `cache` are not exported/accepted.

- [ ] **Step 3: Implement the cache**

In `rule-context.builder.ts`:
  - export `RuleContextCache` with maps for subject, faculty, room, section, existing schedule, faculty commitments, minor blocks, subject restrictions, approved requests, plus `config: Promise<SchedulingConfig> | null`;
  - export `createRuleContextCache()` returning empty maps and `config: null`;
  - add `cache?: RuleContextCache` to `BuildContextInput`;
  - wrap each private loader in a cache lookup/stash using keys equivalent to its current inputs (`subjectId`; `facultyId|termId|excluded ids`; `roomId`; `sectionCode`; `termId|day|excluded ids`; `facultyId|termId|day`; `termId|day`; `termId`; `facultyId|termId`; and a single config key);
  - pass `input.cache` from `build()` to every loader.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @coe-nnect/backend test -- --runInBand test/rule-context-auto-draft-exclusion.spec.ts`
Expected: PASS, including the three pre-existing exclusion tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/scheduling/services/rule-context.builder.ts apps/backend/test/rule-context-auto-draft-exclusion.spec.ts
git commit -m "Cache draft validation context loads per request" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 2: Pass one cache through draft load validation

**Files:**
- Modify: `apps/backend/src/modules/scheduling/services/term-draft-snapshot.service.ts`
- Test: `apps/backend/test/term-draft-snapshot.service.spec.ts`

**Interfaces:**
- Consumes: `createRuleContextCache()` from Task 1.
- Produces: every `ruleContextBuilder.build()` call inside `assess()` receives the same cache object.

- [ ] **Step 1: Write failing service test**

Add a test to `apps/backend/test/term-draft-snapshot.service.spec.ts` with two valid draft/review snapshot entries, a mock `ruleContextBuilder.build`, and a passing prospectus/department/catalog setup. Assert:
  - `build` was called twice;
  - both calls received the same truthy `cache` object;
  - that object has `subjects`, `existingSchedule`, and `config` cache fields.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @coe-nnect/backend test -- --runInBand test/term-draft-snapshot.service.spec.ts`
Expected: FAIL because `assess()` does not pass a cache.

- [ ] **Step 3: Implement the service wiring**

In `TermDraftSnapshotService.assess()`, import and call `createRuleContextCache()` once before the row loop, then add `cache` to each `ruleContextBuilder.build()` input. Do not change conflict ordering, gate creation, or transaction behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @coe-nnect/backend test -- --runInBand test/term-draft-snapshot.service.spec.ts`
Expected: PASS, including the pending-request and snapshot deletion tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/scheduling/services/term-draft-snapshot.service.ts apps/backend/test/term-draft-snapshot.service.spec.ts
git commit -m "Share validation cache across draft load rows" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 3: Verify and publish

**Files:**
- Created earlier: `docs/superpowers/specs/2026-11-28-draft-load-validation-cache-design.md`
- Created earlier: `docs/superpowers/plans/2026-11-28-draft-load-validation-cache.md`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: PR #173 contains the cache optimization and passes full local verification.

- [ ] **Step 1: Run full verification**

Run:
```bash
pnpm typecheck
pnpm typecheck:e2e
pnpm test
pnpm test:e2e:list
```
Expected: all pass; E2E discovery lists 25 tests.

- [ ] **Step 2: Commit design and plan**

```bash
git add docs/superpowers/specs/2026-11-28-draft-load-validation-cache-design.md docs/superpowers/plans/2026-11-28-draft-load-validation-cache.md
git commit -m "Document draft load validation cache approach" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

- [ ] **Step 3: Push and watch CI**

Run:
```bash
git push origin sdd/contextual-bulk-actions
gh pr checks 173 --watch --fail-fast --interval 20
```
Expected: all checks pass, including `Playwright workflow tests`.

- [ ] **Step 4: Merge PR and reconcile local main**

Run:
```bash
gh pr merge 173 --merge
git -C C:/Users/alrha/OneDrive/Documents/GitHub/Websites/coe-nnect fetch origin
git -C C:/Users/alrha/OneDrive/Documents/GitHub/Websites/coe-nnect status -sb
```
Expected: PR merged; local divergence is reported before any reset or force-push.
