# Scheduling rules checklist

This page inventories rules currently exported in `allRules` by `packages/constraint-rules/src/index.ts`. The list contains **27 registered rules**. It is a code inventory, not a claim that every policy flag in project requirements has been approved or implemented.

## Registered rule inventory

| Rule ID | Exported rule              | Area                 |
| ------- | -------------------------- | -------------------- |
| R-1     | `roomTypeMatchRule`        | Room suitability     |
| R-3     | `roomNoLabRule`            | Room suitability     |
| S-5     | `labPriorityRule`          | Room preference      |
| S-10    | `roomOwnershipRule`        | Room preference      |
| R-4     | `labHostsLectureRule`      | Room suitability     |
| S-6     | `servicingPriorityRule`    | Room preference      |
| S-8     | `cohortOverflowRule`       | Room / cohort        |
| H-1     | `facultyOverlapRule`       | Overlap              |
| H-2     | `roomOverlapRule`          | Overlap              |
| H-3     | `sectionOverlapRule`       | Overlap              |
| H-4     | `consecutiveBlocksRule`    | Time                 |
| F-5     | `facultyQualificationRule` | Faculty              |
| H-6     | `noBackToBackLabsRule`     | Laboratory           |
| H-9     | `unsplittable1UnitLabRule` | Laboratory           |
| H-10    | `splittable2UnitLabRule`   | Laboratory           |
| H-11    | `blockDurationSanityRule`  | Time                 |
| F-3     | `workloadOverloadRule`     | Faculty workload     |
| F-6     | `visitingLecturerCapRule`  | Faculty workload     |
| H-13    | `loadTypeMatchRule`        | Subject              |
| H-12    | `minorScheduleBlockRule`   | Time                 |
| S-2     | `dayPairingRule`           | Time preference      |
| S-7     | `lunchBreakRule`           | Time preference      |
| S-9     | `daytimePriorityRule`      | Time preference      |
| S-11    | `subjectRestrictionRule`   | Subject              |
| F-7     | `facultyPreferenceRule`    | Faculty preference   |
| F-8     | `crossDeptRequestRule`     | Faculty assignment   |
| H-14    | `unavailabilityRule`       | Faculty availability |

Rule IDs, names, severity, and behavior are defined in their source files under `packages/constraint-rules/src/rules/`. Treat that implementation and its tests as authoritative.

## Integration notes

- The backend builds a `RuleContext` in `apps/backend/src/modules/scheduling/services/rule-context.builder.ts`.
- Schedule validation is handled by `SchedulingService.validate` and exposed through `POST /api/v1/schedules/validate`.
- The constraints module registers rules and exposes `GET /api/v1/constraints/rules`.
- The frontend validation flow is in `apps/frontend/src/features/plot-subject/PlotSubjectModal.tsx` and `apps/frontend/src/api/schedule.api.ts`.
- Some checks, such as time ordering and operating-hour guards, are implemented in the backend scheduling service rather than in `allRules`; they are not included in the 27-rule count.

## Tests and development

Run the package's tests, type check, or build from the repository root:

```powershell
pnpm --filter @coe-nnect/constraint-rules test
pnpm --filter @coe-nnect/constraint-rules typecheck
pnpm --filter @coe-nnect/constraint-rules build
```

Add or update rule tests when changing behavior, then verify the registered list and backend integration.
