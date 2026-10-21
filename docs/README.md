# CoE-NNECT documentation

Use these guides to set up the applications, understand workspace packages, and check the API and scheduling-rule references. The root [README](../README.md) has the project overview, team, prerequisites, and first-run steps.

## Applications

- [Backend API](apps/backend.md) — API modules, environment configuration, database scripts, and checks.
- [Frontend](apps/frontend.md) — application features, environment configuration, and checks.

## Architecture

- [System architecture](architecture/README.md) — component map, data flows, persistence, and integration status.
- [Database structure](DATABASE%20STRUCTURE/README.md) — ERDs, table inventory, enums, constraints, and the current SQL snapshot.
- [Testing and database validation](testing.md) — backend test commands, fake adapters, migration checks, and CI coverage.

## Packages and services

- [Constraint rules](packages/constraint-rules.md) — the integrated TypeScript scheduling rules engine.
- [IDP client](packages/idp-client.md) — reserved package; not implemented or integrated.
- [Prospectus parser](packages/prospectus-parser.md) — standalone FastAPI service for extracting selectable PDF text.
- [Shared types](packages/shared-types.md) — reserved package; no shared types are exported yet.
- [Solver service](packages/solver-service.md) — separately deployed OR-Tools service called by backend auto-generation.

## References

- [Scheduling API contract](interface-contract/docs/interface-contract/scheduling-api.md) — routes and request/response conventions for schedules.
- [Scheduling rules checklist](reconciliation/scheduling-rules-checklist.md) — current inventory of registered rules and links to implementation.
- [Parser README](../packages/prospectus-parser/README.md) — short entry point to the parser guide.
