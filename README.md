# CoE-NNECT

CoE-NNECT is a scheduling system for the College of Engineering at Western Mindanao State University. It is maintained as a pnpm monorepo with a React frontend, a NestJS API, shared TypeScript packages, and standalone Python services.

## What it does

- Manages departments, terms, faculty, rooms, subjects, sections, and prospectuses.
- Builds and reviews class schedules, checks scheduling constraints, and supports approval and publication workflows.
- Provides role-specific workspaces for department heads, college deans, and administrators.
- Includes timetable views, reports, audit history, notifications, and prospectus PDF extraction.

The schedule solver and IDP client are not currently integrated into the main application. See the package documentation for their current status.

## Repository layout

```text
apps/
  backend/                 NestJS API
  frontend/                React + Vite web application
packages/
  constraint-rules/        Scheduling constraint engine
  idp-client/              Reserved IDP integration package
  prospectus-parser/       FastAPI PDF text extraction service
  shared-types/            Reserved shared TypeScript types package
  solver-service/          Standalone OR-Tools scheduling service
docs/
  apps/                    App-specific guides
  packages/                Package and service guides
```

See the [documentation index](docs/README.md) for details on each app and package.

## Prerequisites

- Node.js 24 or newer
- pnpm 12.6.0
- Git
- A configured Supabase project for backend/database features

The root `package.json` declares the Node.js engine requirement and pins the pnpm package-manager version.

## Getting started

1. Clone the repository and enter its directory:

   ```bash
   git clone https://github.com/RADENzzz/SCHEDULING-SYSTEM-WMSU-.git
   cd SCHEDULING-SYSTEM-WMSU-
   ```

2. Install JavaScript dependencies:

   ```bash
   pnpm install
   ```

3. Copy each app's `.env.example` to its local environment file and set values for your environment:
   - Backend: `apps/backend/.env`
   - Frontend: `apps/frontend/.env.local`

   The backend needs Supabase credentials and a PostgreSQL `DATABASE_URL`. The frontend needs the API URL and Supabase URL/anonymous key. Never commit real environment files or credentials.

4. Start the app processes in separate terminals:

   ```bash
   pnpm --filter @coe-nnect/backend dev
   ```

   ```bash
   pnpm --filter @coe-nnect/frontend dev
   ```

   The frontend is served by Vite, normally at `http://localhost:5173`; the API defaults to port `3000`. See the [backend guide](docs/apps/backend.md) and [frontend guide](docs/apps/frontend.md) for configuration and service details.

## Common commands

| Command                                          | Purpose                                             |
| ------------------------------------------------ | --------------------------------------------------- |
| `pnpm build`                                     | Build workspace projects that define a build script |
| `pnpm test`                                      | Run workspace tests                                 |
| `pnpm lint`                                      | Run workspace lint scripts                          |
| `pnpm typecheck`                                 | Type-check workspace projects                       |
| `pnpm --filter @coe-nnect/constraint-rules test` | Run constraint engine tests                         |
| `pnpm --filter @coe-nnect/backend seed:demo`     | Seed demo data in the configured backend database   |

The Python services have separate dependencies and run instructions in the [package docs](docs/README.md).

## Architecture

```text
Browser
  └── React frontend (apps/frontend)
        └── NestJS API (apps/backend)
              ├── Supabase Auth and PostgreSQL
              └── Scheduling rules (@coe-nnect/constraint-rules)

Standalone services:
  ├── Prospectus PDF parser (packages/prospectus-parser)
  └── OR-Tools solver (packages/solver-service)
```

The backend database schema is managed through Supabase SQL; TypeORM schema synchronization is disabled. Configure the database and credentials before running database-backed features or seed commands.

## Further reading

- [App and package documentation](docs/README.md)
- [Scheduling API contract](docs/interface-contract/docs/interface-contract/scheduling-api.md)
- [Scheduling rules checklist](docs/reconciliation/scheduling-rules-checklist.md)

---

Developed as part of the CPE SD 3 Management Information System project for the College of Engineering, Western Mindanao State University.
