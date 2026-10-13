# Frontend

The `apps/frontend` directory contains the CoE-NNECT browser application. It is built with React, TypeScript, Vite, and Tailwind CSS, with React Router for navigation, React Query for server state, Zustand for client state, and Axios-based API clients.

## Features

- Login and role-protected workspaces for department heads, deans, and administrators.
- Academic data management, schedule planning and review, timetable views, and schedule generation.
- Reports, audit history, approvals, notifications, chat, and settings.
- Prospectus PDF import with editor-defined table and cell regions.

Routes are assembled in `src/App.tsx`; route guards enforce role access. The PDF import and editing experience is restricted to desktop-sized viewports.

## Setup and local development

From the repository root, install dependencies, create the local environment file, configure it, and start Vite:

```powershell
pnpm install
Copy-Item apps\frontend\.env.example apps\frontend\.env.local
pnpm --filter @coe-nnect/frontend dev
```

Vite normally serves the application at `http://localhost:5173`. Configure `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` in `.env.local`; variable names and any optional development login settings are listed in the [frontend environment template](../../apps/frontend/.env.example).

Anything prefixed with `VITE_` is bundled for the browser. Never place service-role keys, passwords, or other secrets in frontend environment variables.

## Build and checks

Run these commands from the repository root:

```powershell
pnpm --filter @coe-nnect/frontend build
pnpm --filter @coe-nnect/frontend typecheck
pnpm --filter @coe-nnect/frontend lint
```

The source is grouped into `src/api`, reusable `src/components`, page-oriented `src/features`, hooks, libraries, state stores, and types.
