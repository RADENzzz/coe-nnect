# Draft load validation cache design

Date: 2026-11-28

## Intent

Loading a saved timetable draft can exceed the browser's 30-second API timeout.
The check step (`POST /v1/schedules/draft-snapshots/:id/preflight`) validates
every saved row by calling `RuleContextBuilder.build()` once per row. Each build
reloads the same subject/faculty/room/section catalog records and the same
term-level schedule, commitment, restriction, and setting data. A large draft
therefore issues many duplicate Supabase queries before any write happens.

The goal is to make draft load validation fast without changing what it checks
or when it writes.

## Goals

- Reuse identical catalog and term-level lookups across all rows in one draft
  preflight or apply request.
- Preserve the exact validation semantics, conflict ordering, and all-or-nothing
  write behavior.
- Leave all other `RuleContextBuilder` callers on the existing uncached path.
- Add tests that fail before the cache is implemented.

## Non-goals

- Changing the frontend timeout or API contract.
- Changing which rules are evaluated or which rows are blocked.
- Caching data across requests or users.

## Anti-goals

- A service-level duplicate of the builder's loaders, which could drift from
  plotting and published-version reuse validation.
- Per-instance caches that could serve stale data on later requests.

## Constraints

- Draft load is restricted to draft/review rows in one term and department.
- Finalized and published rows are never written, deleted, or created.
- Any live editable row with a pending faculty request blocks the load and is
  never cancelled.
- Snapshots remain locked to their original term.
- Preview and compare stay read-only.
- No native `confirm()` or local toast state may be introduced.

## Approaches considered

1. **Per-request cache passed to `build()` (selected).** The service creates one
   cache object per assessment and passes it to every row build. The builder
   memoizes each loader by its existing input key. Other callers omit the cache
   and behave as before. This is small, preserves behavior, and avoids stale
   cross-request data.
2. **New `buildBatch(inputs)` API.** More explicit, but duplicates the single-row
   orchestration and is a larger refactor with more chance of semantic drift.
3. **Cache inside `TermDraftSnapshotService`.** Avoids touching the builder but
   requires duplicating loader logic in the service, which can drift from the
   plotting and reuse paths.

## Design

- Export a `RuleContextCache` type from `rule-context.builder.ts`.
- Add an optional `cache?: RuleContextCache` field to `BuildContextInput`.
- In `build()`, pass the cache to each loader. When present, each loader stores
  and reuses a promise keyed by the values it already queries by:
  subject id, faculty id + term + excluded schedule ids, room id, section code,
  term + day + excluded schedule ids for existing schedules, faculty id + term +
  day for commitments, term + day for minor blocks, term for restrictions,
  faculty id + term for approved requests, and a single config key.
- `TermDraftSnapshotService.assess()` creates one cache before the row loop and
  passes it into every `ruleContextBuilder.build()` call.
- The cache lives only for that assessment call; no module-level or
  instance-level cache is introduced.

## Validation

- Builder test: two `build()` calls sharing one cache issue one query for repeated
  config/subject/section data and return equivalent contexts.
- Service test: multiple draft rows receive the same cache object from
  `assess()`.
- Full workspace checks: `pnpm typecheck`, `pnpm typecheck:e2e`, `pnpm test`,
  `pnpm test:e2e:list`. Browser E2E remains CI-authoritative.
