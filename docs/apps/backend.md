# Backend API

The `apps/backend` directory contains the NestJS API used by CoE-NNECT. It provides authentication, academic data management, scheduling and validation, approvals, reports, notifications, chat, and audit functionality.

## Modules and API behavior

Feature modules are registered in `src/app.module.ts`. They cover users and authentication; departments, programs, terms, faculty, subjects, prospectuses, sections, and rooms; schedules, constraints, and approvals; system configuration, audit, chat, and notifications; and prospectus PDF management.

The global API prefix defaults to `/api` and can be changed with `API_PREFIX`. Routes use NestJS validation, and CORS is configured from `FRONTEND_URL`. Socket.IO gateways support real-time features. See the [scheduling API reference](../interface-contract/docs/interface-contract/scheduling-api.md) for schedule routes and payload conventions.

## Setup and local development

Use Node.js 24 or newer and pnpm 12.6.0. From the repository root:

```powershell
pnpm install
Copy-Item apps\backend\.env.example apps\backend\.env
```

Set the Supabase and PostgreSQL configuration in `apps/backend/.env`, then run the API:

```powershell
pnpm --filter @coe-nnect/backend dev
```

The API listens on port `3000` by default; set `PORT` to change it. Refer to the [backend environment template](../../apps/backend/.env.example) for all supported values, including `DATABASE_URL`, Supabase credentials, `FRONTEND_URL`, and `PROSPECTUS_PARSER_URL`.

## Database and seed scripts

The API uses TypeORM to connect to PostgreSQL. Automatic schema synchronization is disabled. Apply schema changes through the project's Supabase SQL workflow.

The package exposes these database scripts:

```powershell
pnpm --filter @coe-nnect/backend seed:demo
pnpm --filter @coe-nnect/backend db:reset
```

Both commands affect the database configured in the local environment. Review the script and target before running; `db:reset` is destructive.

## Build and checks

Run from the repository root:

```powershell
pnpm --filter @coe-nnect/backend build
pnpm --filter @coe-nnect/backend typecheck
pnpm --filter @coe-nnect/backend test
```

Application code is under `src/`; end-to-end tests and Jest configuration are under `test/`.
