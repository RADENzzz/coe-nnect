# IDP client

`packages/idp-client` reserves the workspace name `@coe-nnect/idp-client` for a possible standalone client to the university's Institutional Data Platform (IDP).

## Current status

The package itself is **not implemented**: it has no usable client, endpoint methods, API types, or public exports. The presence of this package does not mean communication goes through it.

The working IDP integration is implemented in the backend **`IdpModule`** at
`apps/backend/src/modules/idp/`. Milestone 1 covers faculty roster sync,
qualifications, unavailability, signed faculty-change webhooks, and the Faculty
page's **Refresh from IDP** action. See the [IDP integration guide](../integrations/idp.md).

## Why the package remains a placeholder

The backend module owns the integration because it needs direct access to the
faculty, qualification, unavailability, department, subject, and term
repositories, plus the Nest guards and configuration service. Extracting a
standalone workspace package is only worthwhile if another consumer needs the
same IDP client. Until then, keep the implementation in the backend.

If the package is promoted later, it should export typed client methods and
wire types, while the backend keeps ownership of persistence and sync rules.

## Before extracting a shared client

1. Agree on the API contract, authentication, and ownership with the IDP team.
2. Move the wire types and HTTP client out of `apps/backend/src/modules/idp/`.
3. Keep secrets outside source control.
4. Keep mocked tests for signature verification, idempotency, and error mapping.
5. Preserve the existing backend module as the persistence/sync boundary.

## Package checks

The package currently defines these scripts:

```powershell
pnpm --filter @coe-nnect/idp-client typecheck
pnpm --filter @coe-nnect/idp-client test
```

Passing package checks does not imply that the IDP integration is implemented
in this package. The backend module is the implementation.
