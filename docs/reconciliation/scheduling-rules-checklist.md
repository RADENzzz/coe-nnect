# Scheduling Rules Checklist — CoE-NNECT

**Status:** 25 of 25 PM flags implemented
**Last updated:** OCT 4, 2026
**Engine version:** 25 rules (`@coe-nnect/constraint-rules` v0.1.0)


The engine lives at `packages/constraint-rules/` and is consumed by the
backend's `ConstraintsService` at `apps/backend/src/modules/constraints/`.

---

## Required Flags (12 total — 12 done)

| # | Flag | Rule ID | Rule Name | Status | Notes |
|---|------|---------|-----------|--------|-------|
| 1 | Faculty cannot be double-booked in overlapping time slots | H-1 | Faculty Overlap | ✅ | |
| 2 | Room cannot be double-booked in overlapping time slots | H-2 | Room Overlap | ✅ | |
| 3 | Section cannot have two classes in overlapping time slots | H-3 | Section Overlap | ✅ | |
| 4 | No more than 2 consecutive class blocks per day | H-4 | Max Consecutive Blocks | ✅ | |
| 5 | No back-to-back laboratory sessions for faculty or section | H-6 | No Back-to-Back Labs | ✅ | |
| 6 | 1-unit laboratory must be a single continuous 3-hour block | H-9 | 1-Unit Lab Unsplittable | ✅ | |
| 7 | 2-unit laboratory must be split into two 3-hour blocks | H-10 | 2-Unit Lab Splits into 3-Hour Blocks | ✅ | |
| 8 | Lecture room cannot host Lab subject | R-3 | Room 206 Never Hosts Labs | ✅ | Gated by `loadType`: fires only for lab sessions |
| 9 | Visiting Lecturer cannot exceed maximum unit cap | F-6 | Visiting Lecturer Cap | ✅ | Cap default 24 units, tunable via `scheduling_setting` |
| 10 | Plot must fall within operating hours | H-8 | Operating Hours | ✅ | Implemented as inline guard in `scheduling.service.ts` |
| 11 | External minor subject schedules must block conflicting plots | H-12 | Minor Subject Blocks Plot | ✅ | Reads `minor_subject_schedule` |
| 12 | Cross-department faculty assignment requires approved request | F-8 | Cross-Department Request | ✅ | Reads `faculty_request`; approval workflow in `apps/backend/src/modules/approvals/` |

### Supporting Required-tier rules

| Rule ID | Rule Name | Purpose |
|---------|-----------|---------|
| H-7 | Time Ordering | Rejects plots where `endTime <= startTime` (inline guard) |
| H-11 | Block Duration Sanity | Rejects invalid lecture/lab durations |
| H-13 | Load Type Matches Subject | Rejects `loadType` that doesn't match the subject's composition |
| F-5 | Faculty Qualification | Rejects plots for unqualified faculty |
| R-1 | Room Type Match | Rejects plots whose room type doesn't match `subject.required_room_type` |

---

## Warning Flags (11 total — 11 done)

| # | Flag | Rule ID | Rule Name | Status | Notes |
|---|------|---------|-----------|--------|-------|
| 13 | Faculty cannot exceed required weekly teaching hours (Overload) | F-3 | Faculty Workload Overload | ✅ | Compares `assignedHours + candidateHours` vs `requiredHours` |
| 14 | Split blocks should follow standard paired-day patterns | S-2 | Day Pairing | ✅ | M/Th, T/F, W/S |
| 15 | Straight extended lecture block is discouraged | H-11 | Block Duration Sanity (warn branch) | ✅ | 180-min single-block lectures warn, 90-min pass, other durations fail |
| 16 | Lab subjects should be prioritized for lab rooms | S-5 | Lab Priority for Lab Rooms | ✅ | Soft complement to R-1 |
| 17 | Servicing subjects should get priority for shared labs | S-6 | Servicing Priority for Shared Labs | ✅ | Rooms 203 and 204 |
| 18 | Lunch break rule must be applied during validation | S-7 | Lunch Break | ✅ | Warns when session overlaps 12:00–13:00 without a break |
| 19 | Large cohort should trigger overflow section splitting | S-8 | Cohort Overflow | ✅ | Active — reads `section.student_count` from the new `section` table |
| 20 | Daytime slots should be prioritized over evening slots | S-9 | Daytime Priority | ✅ | Evening starts at 17:30 |
| 21 | Room ownership should guide scheduling priority | S-10 | Room Ownership Priority | ✅ | |
| 22 | Straight lecture block may be allowed | (same as #15) | — | ✅ | Covered by H-11 |
| 23 | Lab room may host lecture when no better option exists | R-4 | Lab Room Hosts Lecture | ✅ | Allows but warns |

---

## Optional Flags (2 total — 2 done)

| # | Flag | Rule ID | Rule Name | Status | Notes |
|---|------|---------|-----------|--------|-------|
| 24 | Faculty time preference may be enforced as hard or ignored | F-7 | Faculty Time Preference | ✅ | Currently soft; hard enforcement deferred until FR 3.1.6 UX exists |
| 25 | Restricted subjects must not conflict in time slots | S-11 | Subject Restriction | ✅ | Reads `subject_restriction` with custom `warning_message` |

---

## Engine architecture

- **Location:** `packages/constraint-rules/`
- **Rule interface:** `ConstraintRule` in `src/types/rule.interface.ts`
- **Context shape:** `RuleContext` in `src/types/rule-context.type.ts`
- **Engine:** `evaluate(rules, context)` in `src/engine.ts`
- **Registry:** `RuleRegistry` in `src/registry.ts`
- **All rules:** exported as `allRules` from `src/index.ts`
- **Rule categories:** `room`, `time`, `overlap`, `lab`, `faculty`, `subject`, `workload`
- **Rule types:** `hard` (return pass/fail) or `soft` (return pass/warn). Some rules
  (H-11) are tagged hard but can emit warn — the engine buckets by `result.status`,
  not by rule `type`.

### Test coverage

- **164 unit tests** across 26 test files
- Run with `pnpm --filter @coe-nnect/constraint-rules test`

### Backend integration

- `apps/backend/src/modules/scheduling/services/rule-context.builder.ts` — loads
  all data needed by rules from Supabase, shapes it into a `RuleContext`
- `apps/backend/src/modules/scheduling/scheduling.service.ts::validate` — the
  endpoint that calls the engine and returns `{ valid, hardConflicts, softWarnings, alternatives }`
- `apps/backend/src/modules/constraints/` — registers all rules at boot and exposes
  `GET /api/v1/constraints/rules` for inspection

### Frontend integration

- `apps/frontend/src/features/plot-subject/PlotSubjectModal.tsx` — renders
  hard conflicts (red) and soft warnings (amber) live as the user fills the form
- `apps/frontend/src/api/schedule.api.ts` — `ValidateResult` type matches the
  backend's response shape

---

## Rule count by category

| Category | Count | Rules |
|----------|-------|-------|
| Room | 8 | R-1, R-3, R-4, S-5, S-6, S-8, S-10, H-2 |
| Time | 7 | H-4, H-6, H-11, H-12, S-2, S-7, S-9 |
| Overlap | 3 | H-1, H-2 (shared), H-3 |
| Lab | 3 | H-6 (shared), H-9, H-10 |
| Faculty | 4 | F-3, F-5, F-6, F-7 |
| Subject | 2 | H-13, S-11 |
| Workload | 1 | F-3 (shared) |
| **Total** | **25 unique** | |

Rules are shared across categories when they span concerns (H-2 is both
Room and Overlap; H-6 is both Time and Lab; F-3 is both Faculty and Workload).
---

## How to run

```bash
# Run the engine's test suite
pnpm --filter @coe-nnect/constraint-rules test

# Rebuild the package after editing a rule
pnpm --filter @coe-nnect/constraint-rules build

# Restart the backend to pick up new rules
pnpm --filter @coe-nnect/backend dev

# Inspect the rules the running backend has registered
curl -H "Authorization: Bearer <jwt>" http://localhost:3000/api/v1/constraints/rules
