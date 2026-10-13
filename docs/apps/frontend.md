# Frontend

`apps/frontend` is the CoE-NNECT browser application, built with React 18, TypeScript, Vite, and Tailwind CSS. It uses React Router for navigation, React Query for server state, Zustand for client state, and Axios-based API clients.

## Main areas

- Login and role-protected workspaces
- Department-head views for schedules, sections, subjects, prospectuses, faculty, and rooms
- Dean and administrator views for departments, users, approvals, and system settings
- Timetables, reports, audit history, notifications, and settings
- Prospectus PDF import and table-region editing

Routes are composed in `src/App.tsx`. Route access is guarded by role; importing/editing a prospectus PDF also requires a desktop viewport.

## Local development

From the repository root:

```powershell
pnpm install
Copy-Item apps\frontend\.env.example apps\frontend\.env.local
pnpm --filter @coe-nnect/frontend dev
```

Vite normally serves the app at `http://localhost:5173`. Set `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` in `.env.local`; see [`apps/frontend/.env.example`](../../apps/frontend/.env.example). Optional development login credentials can also be set there. Do not put production secrets in Vite variables because values prefixed with `VITE_` are available to the client.

## Build and checks

```powershell
pnpm --filter @coe-nnect/frontend build
pnpm --filter @coe-nnect/frontend typecheck
pnpm --filter @coe-nnect/frontend lint
```

The app source is organized into `src/api`, shared `src/components`, page-oriented `src/features`, hooks, libraries, state stores, and types.
