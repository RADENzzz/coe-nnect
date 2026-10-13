# Constraint rules

`packages/constraint-rules` is the TypeScript scheduling validation package consumed by the backend. Its public API is exported from `src/index.ts`.

## What it provides

- A `ConstraintRule` contract and typed rule context/result structures.
- `RuleRegistry` to organize rules.
- `runRules` and `evaluate` to run rules against a scheduling context.
- Helpers to detect hard failures and collect soft warnings.
- Time conversion and overlap helpers.
- Rules covering faculty qualifications, availability and workload; room suitability and overlap; section overlap; time patterns; laboratory scheduling; subject restrictions; and other scheduling priorities.

An evaluation contains the validity result, hard conflicts, soft warnings, and per-rule evaluations. A failed hard rule makes the result invalid; soft warnings do not by themselves invalidate it.

## Usage

Import from the workspace package rather than reaching into its source paths:

```ts
import { allRules, evaluate } from "@coe-nnect/constraint-rules";

const result = evaluate(allRules, context);
if (!result.valid) {
  // Handle result.hardConflicts before accepting the schedule change.
}
```

`context` must satisfy the exported `RuleContext` type. The backend's constraints module is the integration point for API validation.

## Development

```powershell
pnpm --filter @coe-nnect/constraint-rules test
pnpm --filter @coe-nnect/constraint-rules typecheck
pnpm --filter @coe-nnect/constraint-rules build
```

Add rule tests alongside the rule implementation. Keep rule metadata and result severity consistent with the existing rule types.
