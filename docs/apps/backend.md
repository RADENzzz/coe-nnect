# Backend API

`apps/backend` is the NestJS API used by the CoE-NNECT frontend. It provides authentication, academic data management, scheduling, approvals, constraints, reports, notifications, chat, and audit functionality.

## Main modules

The modules are registered in `src/app.module.ts`:

- Authentication and users
- Departments, programs, terms, faculty, subjects, prospectuses, sections, and rooms
- Schedule management, validation, and approvals
- System configuration, audit, chat, and notifications
- Prospectus PDF management

The global API prefix defaults to `/api` and can be changed with `API_PREFIX`. HTTP validation uses NestJS's global `ValidationPipe`; the app also configures CORS from `FRONTEND_URL` and enables Socket.IO gateways.

## Requirements and setup

Use Node.js 24 or newer and pnpm 12.6.0. From the repository root:

```powershell
pnpm install
Copy-Item apps\backend\.env.example apps\backend\.env
```

Set the required Supabase and PostgreSQL values in `apps/backend/.env`, then start the API:

```powershell
pnpm --filter @coe-nnect/backend dev
```

The API listens on port `3000` by default. Set `PORT` to change it. Other environment settings are documented inline in [`apps/backend/.env.example`](../../apps/backend/.env.example), including `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URL`, and `PROSPECTUS_PARSER_URL`.

## Database and seed scripts

The API connects to PostgreSQL through TypeORM. `synchronize` is disabled: manage schema changes through the repository's Supabase SQL workflow rather than automatic TypeORM synchronization.

With a correctly configured local environment, the package scripts include:

```powershell
pnpm --filter @coe-nnect/backend seed:demo
pnpm --filter @coe-nnect/backend db:reset
```

Review each script and target database before running it. `db:reset` is destructive to the selected database.

## Development checks

```powershell
pnpm --filter @coe-nnect/backend build
pnpm --filter @coe-nnect/backend typecheck
pnpm --filter @coe-nnect/backend test
```

Backend source is in `src/`; end-to-end tests and their Jest configuration are in `test/`.
