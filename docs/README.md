# CoE-NNECT documentation

Use these guides to set up the applications, understand workspace packages, and check the API, database, and scheduling-rule references. The root [README](../README.md) has the project overview, team, prerequisites, and first-run steps.

## Start here

- **New to the project?** Read the root [README](../README.md), then the [system architecture](architecture/README.md).
- **Setting up a workstation?** Follow the [frontend guide](apps/frontend.md) and [backend guide](apps/backend.md).
- **Changing scheduling behavior?** Read [constraint rules](packages/constraint-rules.md) and the [rules checklist](reconciliation/scheduling-rules-checklist.md).
- **Changing the database?** Read the [Supabase workflow](../supabase/README.md) and [database structure](DATABASE%20STRUCTURE/README.md).
- **Preparing a release?** Use the [testing guide](testing.md) and [Railway deployment guide](operations/railway.md).
- **Contributing code?** Read [CONTRIBUTING.md](../CONTRIBUTING.md).

## Applications

- [Backend API](apps/backend.md) — modules, route map, authentication, Cap CAPTCHA, security controls, environment configuration, database scripts, and checks.
- [Frontend](apps/frontend.md) — routes, role guards, feature map, live presence, environment configuration, build, and checks.

## Features

- [Chat and presence](features/chat.md) — eligible roles, two-pane layout, conversations, messages, Realtime delivery, heartbeats, and unread state.
- [Dashboard](features/dashboard.md) — department-head and dean dashboard cards, attention queues, department health, and data sources.
- [Elective subjects](features/electives.md) — catalog model, elective PDF tables, import resolution, temporary codes, and scheduling behavior.

## Architecture

- [System architecture](architecture/README.md) — component map, data flows, persistence, deployment topology, and integration status.
- [Database structure](DATABASE%20STRUCTURE/README.md) — ERDs, table inventory, enums, constraints, and the current SQL snapshot.
- [Testing and database validation](testing.md) — backend, constraint-rule, migration, and Playwright coverage plus CI behavior.

## Integrations

- [IDP integration](integrations/idp.md) — faculty roster, qualifications, and unavailability sync, plus schedule, faculty-request, and change-request exchange with the Institutional Data Platform.
- [IDP integration handoff](integrations/idp-handoff.md) — what to configure, what to send the IDP team, and the end-to-end test plan.
- [IDP Milestone 1 checkpoint](integrations/idp-milestone-1-checkpoint.md) — implementation record, verification, and handoff notes.
- [IDP Milestone 3 checkpoint](integrations/idp-milestone-3-checkpoint.md) — change requests, acknowledgements, and faculty-request status publishing.

## Operations

- [Backup and restore](operations/backup-restore.md) — database, storage, verification, and production restore procedure.
- [Railway deployment](operations/railway.md) — Infrastructure as Code, four services, manual variables, domains, and smoke tests.
- [Temporary public link with Cloudflare Tunnel](operations/cloudflare-tunnel.md) — share the local app through a quick `trycloudflare.com` URL for demos.

## Packages and services

- [Constraint rules](packages/constraint-rules.md) — the integrated TypeScript scheduling rules engine and its 194 tests.
- [IDP client](packages/idp-client.md) — reserved package; the working IDP integration lives in the backend module.
- [Prospectus parser](packages/prospectus-parser.md) — standalone FastAPI service for extracting selectable PDF text and optional OCR.
- [Shared types](packages/shared-types.md) — reserved package; no shared types are exported yet.
- [Solver service](packages/solver-service.md) — separately deployed OR-Tools service called by backend auto-generation.

## Project policies

- [Contributing](../CONTRIBUTING.md) — local setup, branch and commit conventions, validation, and pull-request expectations.
- [Security policy](../SECURITY.md) — supported versions, private vulnerability reporting, scope, and implemented controls.
- [Accessibility statement](../ACCESSIBILITY.md) — conformance target, audit method, assistive-technology support, and known limitations.

## References

- [Scheduling API contract](interface-contract/docs/interface-contract/scheduling-api.md) — routes and request/response conventions for schedules.
- [Scheduling rules checklist](reconciliation/scheduling-rules-checklist.md) — current inventory of registered rules and links to implementation.
- [Parser README](../packages/prospectus-parser/README.md) — short entry point to the parser guide.
- [Solver README](../packages/solver-service/README.md) — short entry point to the solver guide.
