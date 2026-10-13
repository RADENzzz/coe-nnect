# Shared types

`packages/shared-types` reserves the workspace name `@coe-nnect/shared-types` for TypeScript types shared across the frontend and backend.

## Current status

The package is **not implemented**. Its tracked `src` files are empty and it currently exports no API or type declarations. Do not rely on a type import from this package yet; the frontend and backend still have their own types.

The source filenames indicate intended domains such as API responses, constraints, faculty, IDP, rooms, schedules, subjects, and users. Those names are placeholders, not implemented contracts.

## When adding shared types

Add stable, transport-level types that are genuinely shared by more than one workspace project. Export them from `src/index.ts`, avoid importing runtime app code into this package, and update consumers and tests in the same change.

The package currently defines a `typecheck` script:

```powershell
pnpm --filter @coe-nnect/shared-types typecheck
```
