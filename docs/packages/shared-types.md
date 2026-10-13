# Shared types

`packages/shared-types` reserves the workspace name `@coe-nnect/shared-types` for transport-level TypeScript types that may eventually be shared across applications.

## Current status

This package is **not implemented** and currently exports no usable types. The frontend and backend maintain their own type definitions. Placeholder source filenames are not API contracts; do not import or rely on them.

## Adding shared types

Only move a type here when it is stable and genuinely needed by multiple workspace projects. Export it from `src/index.ts`, keep this package independent of application runtime code, and update consumers and tests in the same change.

The package defines a type-check script:

```powershell
pnpm --filter @coe-nnect/shared-types typecheck
```
