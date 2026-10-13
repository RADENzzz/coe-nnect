# IDP client

`packages/idp-client` reserves the workspace name `@coe-nnect/idp-client` for a future client to the university's Individual Daily Program (IDP) system.

## Current status

The package is **not implemented or integrated**. Its tracked TypeScript source files are empty, so it currently provides no client, endpoint methods, types, or usable public exports. The package manifest lists Axios as a dependency, but there is no working API implementation yet.

Potential future integration areas include faculty data, qualifications, designations, schedules, and non-class commitments. These are intended areas only; no endpoint or authentication contract is defined here.

## Before implementing

Confirm the IDP API contract and authentication approach with its owner. Then implement and export typed client methods, document configuration without embedding credentials, add mocked tests, and integrate the client through an explicit backend module or service.

## Package checks

The package manifest defines `typecheck` and `test` scripts:

```powershell
pnpm --filter @coe-nnect/idp-client typecheck
pnpm --filter @coe-nnect/idp-client test
```

These checks do not imply that the integration is implemented.
