# CoE-NNECT documentation

Use these guides to set up the applications, understand workspace packages, and check the API and scheduling-rule references. The root [README](../README.md) has the project overview, team, prerequisites, and first-run steps.

## Applications

- [Backend API](apps/backend.md) — API modules, environment configuration, database scripts, and checks.
- [Frontend](apps/frontend.md) — application features, environment configuration, and checks.

## Architecture

- [System architecture](architecture/README.md) — component map, data flows, persistence, and integration status.
- [Database structure](DATABASE%20STRUCTURE/README.md) — ERDs, table inventory, enums, constraints, and the current SQL snapshot.
- [Testing and database validation](testing.md) — backend test commands, fake adapters, migration checks, and CI coverage.

## Integrations

- [IDP integration](integrations/idp.md) — faculty roster, qualifications, and unavailability sync, plus schedule, faculty-request, and change-request exchange with the Institutional Data Platform.
- [IDP integration handoff](integrations/idp-handoff.md) — what to configure, what to send the IDP team, and the end-to-end test plan.
- [IDP Milestone 1 checkpoint](integrations/idp-milestone-1-checkpoint.md) — implementation record, verification, and handoff notes.
- [IDP Milestone 3 checkpoint](integrations/idp-milestone-3-checkpoint.md) — change requests, acknowledgements, and faculty-request status publishing.

## Operations

- [Backup and restore](operations/backup-restore.md) — database, storage, verification, and production restore procedure.
- [Railway deployment](operations/railway.md) — Infrastructure as Code, services, manual variables, and domains.
- [Temporary public link with Cloudflare Tunnel](operations/cloudflare-tunnel.md) — share the local app through a quick `trycloudflare.com` URL for demos.

## Packages and services

- [Constraint rules](packages/constraint-rules.md) — the integrated TypeScript scheduling rules engine.
- [IDP client](packages/idp-client.md) — reserved package; the working IDP integration lives in the backend module.
- [Prospectus parser](packages/prospectus-parser.md) — standalone FastAPI service for extracting selectable PDF text.
- [Shared types](packages/shared-types.md) — reserved package; no shared types are exported yet.
- [Solver service](packages/solver-service.md) — separately deployed OR-Tools service called by backend auto-generation.

## References

- [Scheduling API contract](interface-contract/docs/interface-contract/scheduling-api.md) — routes and request/response conventions for schedules.
- [Scheduling rules checklist](reconciliation/scheduling-rules-checklist.md) — current inventory of registered rules and links to implementation.
- [Parser README](../packages/prospectus-parser/README.md) — short entry point to the parser guide.
