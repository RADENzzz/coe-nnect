# Constraint rules

`packages/constraint-rules` is the TypeScript scheduling validation package integrated with the NestJS backend. Its public API is exported from `src/index.ts`; `allRules` currently contains 27 rules. See the [rule inventory](../reconciliation/scheduling-rules-checklist.md) for the IDs and implementation links.

## API overview

The package provides:

- `ConstraintRule` and typed rule context/result structures.
- `RuleRegistry`, `runRules`, and `evaluate` for registering and evaluating rules.
- Helpers for identifying hard failures and collecting soft warnings.
- Time conversion and overlap utilities.

An evaluation includes validity, hard conflicts, soft warnings, and per-rule results. Hard failures make an evaluation invalid; soft warnings alone do not. Some schedule validation checks are implemented directly in the backend service rather than as registered package rules; those are not included in the 27-rule count.

## Example

Import from the workspace package instead of reaching into internal source paths:

```ts
import { allRules, evaluate } from "@coe-nnect/constraint-rules";

const result = evaluate(allRules, context);
if (!result.valid) {
  // Handle result.hardConflicts before accepting the schedule change.
}
```

`context` must satisfy the exported `RuleContext` type. The backend's constraints and scheduling modules are the integration points for API validation.

## Development

Run from the repository root:

```powershell
pnpm --filter @coe-nnect/constraint-rules test
pnpm --filter @coe-nnect/constraint-rules typecheck
pnpm --filter @coe-nnect/constraint-rules build
```

Add or update tests alongside each rule change. Keep rule metadata, evaluation severity, and documentation in sync.
