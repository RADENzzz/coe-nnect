# Frontend

The `apps/frontend` directory contains the CoE-NNECT browser application. It is a React single-page application built with TypeScript, Vite, and Tailwind CSS. React Router handles navigation, React Query manages server state, Zustand holds client state, and Axios-based modules in `src/api` call the backend.

## Stack and source layout

| Area | Location | Notes |
| --- | --- | --- |
| Entry point | `src/main.tsx` | Installs React Query, the router, the auth provider, and global styles. |
| Routes | `src/App.tsx` | Route tree, role guards, maintenance gate, and presence provider. |
| API clients | `src/api` | Axios clients for auth, users, chat, schedules, academic data, reports, and IDP. |
| Reusable UI | `src/components` | Layout shells, auth guards, presence provider, and shared controls. |
| Feature screens | `src/features` | Page-oriented modules such as dashboard, timetable, chat, import, reports, and settings. |
| Hooks | `src/hooks` | Query/mutation hooks and the presence heartbeat. |
| Libraries | `src/lib` | Navigation config, API base resolution, sound, formatting, and helpers. |
| Stores | `src/store` | Zustand stores for auth, theme, appearance, and UI state. |
| Types | `src/types` | Frontend transport and view-model types. |

The application uses the Material Symbols icon set, Tailwind design tokens, and a shared shell (`AppShell` for department heads, `DeanShell` for the dean/secretary/dev account). Theme and accent settings are persisted client-side.

## Routes and access

All application routes except the public landing page, login, maintenance page, and deactivated-department wall require a session. `ProtectedRoute` checks the authenticated profile's role, and the backend enforces authorization independently.

| Route | Workspace | Purpose |
| --- | --- | --- |
| `/` | Public | Landing page with published schedules, college statistics, faculty directory, and IDP integration status. |
| `/login` | Public | Email/password sign-in with the Cap CAPTCHA widget. |
| `/maintenance` | Public | Maintenance wall shown when `system_status.maintenance_mode` is enabled. |
| `/recovery/verify` | Public | Consumes a recovery-email verification token from the emailed link. |
| `/reset-password` | Public | Consumes a password-reset token and sets a new password. |
| `/department-deactivated` | Department head | Wall shown when the signed-in head's department is inactive. |
| `/dashboard` | Department head | Department dashboard: schedule, faculty, room, and attention summaries. |
| `/timetable` | Department head | Interactive schedule planner and timetable. |
| `/sections` | Department head | Section management. |
| `/approvals` | Department head | Cross-department faculty requests and approval status. |
| `/subjects` | Department head | Subject catalog, including regular, minor, and elective tabs. |
| `/programs` | Department head | Program management. |
| `/prospectus` | Department head | Curriculum/prospectus entries. |
| `/faculty` | Department head | Faculty directory, qualifications, preferences, unavailability, and IDP refresh. |
| `/rooms` | Department head | Room inventory and preferences. |
| `/reports`, `/reports/workload`, `/reports/approvals`, `/reports/rooms` | Department head | Reports hub and individual reports. |
| `/import`, `/import/:id` | Department head | Prospectus PDF list and desktop-only region editor. |
| `/notifications` | Department head | Notification inbox. |
| `/settings` | Department head | Profile, security, appearance, and notification settings. |
| `/help` | Department head | In-app help and tutorials. |
| `/dean/dashboard` | Dean, secretary | College-wide dashboard. |
| `/dean/departments`, `/dean/departments/manage` | Dean, secretary | Department list and management. |
| `/dean/programs`, `/dean/subjects`, `/dean/sections`, `/dean/rooms` | Dean, secretary | College-wide academic records. |
| `/dean/faculty` | Dean, secretary | College-wide faculty directory. |
| `/dean/users` | Dean, secretary | User lifecycle management. |
| `/dean/approvals` | Dean | Schedule approvals and finalization. |
| `/dean/requests` | Dean | Cross-department faculty requests. |
| `/dean/timetable` | Dean | Read-only college timetable. |
| `/dean/import`, `/dean/import/:id` | Dean, secretary | Prospectus PDF import. |
| `/dean/reports/*` | Dean | Reports hub and reports. |
| `/dean/system-settings` | Dean, secretary | System configuration and status banner. |
| `/dean/audit-trail` | Dean | Audit history. |
| `/dean/notifications`, `/dean/settings`, `/dean/help` | Dean, secretary | Shared account surfaces. |
| `/dean/dev-tools` | Hidden administrator | Reset, seed, job status, and account maintenance. |
| `/admin/*` | Redirect | Legacy admin URLs redirect to `/dean/dashboard`. |

### Role behavior

- **`college_dean`** gets the full dean navigation, including approvals, audit trail, reports, and user management.
- **`college_secretary`** shares the dean shell and most operational pages, but the navigation omits approvals, audit trail, reports, the read-only timetable, and dev tools.
- **`department_head`** uses the department shell. `DepartmentActiveGate` blocks the entire shell when the department is deactivated, so no polling or stale fetches continue behind the wall.
- **`viewer`** is a legacy role. It maps to the department-head navigation but is not used by the demo accounts.
- **`administrator`** is the hidden developer account. `DeanRouteGuard` redirects it to `/dean/dev-tools` from every other dean route, and its navigation contains only Dev Tools.

## Authentication and session

1. The login page renders the Cap widget against `<API base>/v1/auth/cap/`.
2. The widget solves a challenge and emits a token.
3. The page calls `POST /api/v1/auth/login` with the email, password, and `capToken`.
4. The backend verifies the Cap token, authenticates with Supabase Auth, loads the application profile, and returns the session plus role and department state.
5. The frontend stores the Supabase session through the auth provider and attaches the access token to API requests.
6. A `401` response signs out the browser session and redirects to login.

The backend is the authority for authorization. Browser route guards shape navigation and prevent dead-end screens, but they are not a security boundary.

**Forgot password?** posts the entered address to `/api/v1/recovery/request`. The backend sends its own reset link, so this no longer uses Supabase's reset email. The link opens `/reset-password?token=...`, which calls `/api/v1/recovery/reset`. Settings → Security adds the optional recovery address and its verification flow; see [Password recovery email](../operations/email-recovery.md).

`MaintenanceGate` checks the public system status before rendering the app. The landing page remains reachable during maintenance because it is read-only and does not require a session. Development builds can set `VITE_MAINTENANCE_BYPASS=true` to ignore the flag locally.

## Chat and presence

Chat is mounted for eligible roles as a floating widget backed by a two-pane drawer:

- The left pane lists conversations or people, with search and unread badges.
- The right pane shows the message thread, day separators, copyable messages, and a composer.
- The drawer remembers the last open conversation and its open/closed state for the session.
- A new-message sound and unread counters are driven by Socket.IO events.

Presence uses Supabase Realtime on the `presence:online-users` channel for the live online dot. `usePresenceHeartbeat` calls `POST /api/v1/users/me/heartbeat` every 60 seconds and skips the beat while the tab is hidden; the backend writes `user_presence.last_seen_at`. The UI combines the live channel state with the persisted timestamp, showing "Active just now" or a relative last-seen label when the live dot is off.

See [Chat and presence](../features/chat.md) for the full behavior and API contract.

## Data fetching and state

- **React Query** owns server state: queries are keyed by feature and invalidated after mutations, and chat/notification sockets invalidate the relevant keys.
- **Zustand** owns the auth profile, theme, appearance, and small UI state.
- **Axios** clients live in `src/api`; they resolve the API base at runtime and attach the Supabase bearer token.
- **Socket.IO** carries notification and chat push events; Supabase Realtime carries presence and new-message table events.
- **URL search params** hold filter state for pages such as the subject tabs (`/subjects?kind=elective`).

`resolveApiBaseUrl` keeps local, tunnel, and deployed use on one origin. If the page is opened from a non-loopback host while `VITE_API_BASE_URL` still points at `localhost`, the app falls back to the same-origin `/api` path so the Vite proxy or production Node server can forward the request. The same fallback applies when the configured API is a cross-origin `*.up.railway.app` URL: browsers cannot reach Railway's private network, and the production CSP only allows same-origin API calls.

## Environment variables

Copy `apps/frontend/.env.example` to `apps/frontend/.env.local`. Vite loads `.env.local` in development.

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Yes | Backend API base. Use `http://localhost:3000/api` locally or `/api` behind the same-origin proxy. |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL. |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon/publishable key. Safe for the browser; RLS still applies. |
| `VITE_IDP_APP_URL` | No | Shows the IDP faculty-app promo on the landing page. Only `http`/`https` values are rendered. |
| `VITE_IDP_APP_NAME` | No | Overrides the promo display name. |
| `VITE_DEV_ADMIN_EMAIL`, `VITE_DEV_ADMIN_PASSWORD` | No | Development-only login shortcut. |
| `VITE_DEV_HEAD_EMAIL`, `VITE_DEV_HEAD_PASSWORD` | No | Development-only login shortcut. |
| `VITE_MAINTENANCE_BYPASS` | No | Development-only maintenance bypass. |
| `VITE_ALLOWED_HOSTS` | No | Extra comma-separated hostnames Vite should accept (custom tunnel domains, ngrok). |
| `VITE_API_PROXY_TARGET` | No | Vite proxy target for `/api` and `/socket.io`; defaults to `http://localhost:3000`. |
| `VITE_TUNNEL` | No | Set by `pnpm dev:online` to make HMR use `wss://` through the tunnel. |

Anything prefixed with `VITE_` is bundled for the browser. Never place service-role keys, passwords, `CAP_SECRET`, or other secrets in frontend environment variables.

## Local development

From the repository root:

```powershell
pnpm install
Copy-Item apps\frontend\.env.example apps\frontend\.env.local
pnpm --filter @coe-nnect/frontend dev
```

Vite normally serves the application at `http://localhost:5173` and proxies `/api` and `/socket.io` to `http://localhost:3000`. The backend must be running for authenticated screens. The root `pnpm dev` command starts both.

The public landing page reads only from `/api/v1/public/*`; drafts, flagged rows, pending faculty requests, and all contact or identifier fields stay internal.

## Build and checks

Run these commands from the repository root:

```powershell
pnpm --filter @coe-nnect/frontend lint
pnpm --filter @coe-nnect/frontend typecheck
pnpm --filter @coe-nnect/frontend build
```

ESLint uses the flat config in `apps/frontend/eslint.config.js`. Existing warnings are reported but do not fail CI; errors do.

The frontend has no unit or component test runner and no `test` script. Its automated coverage is linting, TypeScript checking, the production build, and the Playwright end-to-end workflow in `e2e/`. See the [testing guide](../testing.md).

## Production serving

Railway builds the Vite bundle and starts `apps/frontend/server.mjs` as a Node server. That server:

- serves the static build output;
- stamps every HTML response with a fresh CSP nonce and sends a strict
  `Content-Security-Policy` (`script-src 'self' 'wasm-unsafe-eval' 'nonce-...'`);
- proxies `/api` to `BACKEND_HOST:BACKEND_PORT`, probing `/api/v1/health` and
  falling back to `BACKEND_FALLBACK_URL` when the private route is unreachable;
- proxies `/socket.io` with websocket support, using the same backend selection;
- falls back to `index.html` for client-side routes.

The Cap solver WASM and pako fallback are self-hosted under `public/cap/` and
pointed to by `public/cap-config.js`, so the CSP does not need a CDN source.
`public/theme-boot.js` copies the per-request nonce into
`window.CAP_SCRIPT_NONCE` for Cap's instrumentation iframe.

Because the browser sees a single origin, production needs no `VITE_API_BASE_URL` pointing at a public backend and no CORS preflight from the frontend. `VITE_API_BASE_URL=/api` is set by the Railway IaC file. See the [Railway deployment guide](../operations/railway.md).
