# IDP client

`packages/idp-client` reserves the workspace name `@coe-nnect/idp-client` for a possible client to the university's Individual Daily Program (IDP) system.

## Current status

The package is **not implemented and is not integrated** with the main application. It has no usable client, endpoint methods, API types, or public exports. The presence of a package manifest or dependency does not indicate that IDP communication is available.

Possible future use cases include synchronizing faculty information and qualifications and retrieving non-class commitments. These are ideas only: no IDP endpoint, data contract, or authentication method is documented or implemented.

## Before implementation

Agree on the API contract, authentication, and ownership with the IDP service team. Then define typed client methods, configure secrets outside source control, add mocked tests, and integrate the client through an explicit backend service.

## Package checks

The package currently defines these scripts:

```powershell
pnpm --filter @coe-nnect/idp-client typecheck
pnpm --filter @coe-nnect/idp-client test
```

Passing package checks does not imply that the IDP integration is implemented.
