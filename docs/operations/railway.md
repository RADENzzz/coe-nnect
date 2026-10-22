# Railway deployment

The Railway project is defined with **Infrastructure as Code** in
[`.railway/railway.ts`](../.railway/railway.ts). Railway's older
`railway.json` / `railway.toml` format is deprecated and stops being read on
2026-12-01, so the per-package `railway.json` files have been removed.

## Services

| Service    | Source                       | Public? | Healthcheck      |
| ---------- | ---------------------------- | ------- | ---------------- |
| `frontend` | repo root (Vite build)       | Yes     | `/`              |
| `backend`  | repo root (NestJS build)     | No      | `/api/v1/health` |
| `solver`   | `packages/solver-service`    | No      | `/health`        |
| `parser`   | `packages/prospectus-parser` | No      | `/health`        |

The browser only talks to the **frontend** origin. `apps/frontend/server.mjs`
serves the Vite build and proxies `/api` and `/socket.io` to the backend over
Railway's private network. That is why the backend does not need a public
domain, CORS preflights, or a build-time backend URL.

## Prerequisites

- Railway CLI **5.42.1 or newer** (the IaC engine ships in the CLI):

  ```bash
  npm install -g @railway/cli
  railway --version
  ```

- The `railway` TypeScript SDK is already a root devDependency, so
  `pnpm install` makes `railway/iac` available to the CLI.
- The repository linked to the Railway project and environment you want to
  change:

  ```bash
  railway link
  ```

- Create the manual variables listed below. They are declared with
  `preserve()` in the IaC file, so `railway config apply` will not overwrite
  them.

## Apply

Commit and push the changes to `main` first: Railway builds each service from
the GitHub repository, not from your local working tree. Then run:

```bash
railway config plan
railway config apply
```

`plan` previews the changes. `apply` asks for confirmation; deleting resources
or variables additionally requires `--confirm-destructive`.

If Railway does not start a deployment for a newly created service, open the
service and click **Deploy** (or push another commit to `main`).

If Railway reports that an existing service is managed by `railway.json`,
delete that service (or disconnect its config-as-code setting) before applying.
A service can only be managed by one system at a time. Services created by this
file are named `frontend`, `backend`, `solver`, and `parser`; rename or remove
older services with different names before applying if you want to keep the
same project tidy.

## Variables to enter manually

Secrets are intentionally **not** committed. Enter these in the Railway
dashboard after the services exist.

### Backend service

| Variable                    | Required | Notes                                                  |
| --------------------------- | -------- | ------------------------------------------------------ |
| `DATABASE_URL`              | Yes      | Supabase Postgres connection string.                   |
| `SUPABASE_URL`              | Yes      | Supabase project URL.                                  |
| `SUPABASE_ANON_KEY`         | Yes      | Supabase anon key.                                     |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes      | Server-side Supabase key.                              |
| `GITHUB_TOKEN`              | No       | Raises GitHub API limits for the repo stats endpoints. |
| `FRONTEND_URL`              | No       | Exact frontend origin, for a custom domain.            |
| `ENABLE_SWAGGER`            | No       | Set to `true` only together with the next two values.  |
| `SWAGGER_USER`              | No       | Basic-auth user for production Swagger.                |
| `SWAGGER_PASSWORD`          | No       | Basic-auth password for production Swagger.            |
| `CORS_ALLOW_TUNNEL`         | No       | `true` only for temporary Cloudflare tunnel demos.     |

`DATABASE_SSL=true`, `NODE_ENV=production`, `API_PREFIX=api`,
`TRUST_PROXY=1`, and the private solver/parser URLs are set by the IaC file.

### Frontend service

| Variable                 | Required | Notes                                            |
| ------------------------ | -------- | ------------------------------------------------ |
| `VITE_SUPABASE_URL`      | Yes      | Same value as the backend's `SUPABASE_URL`.      |
| `VITE_SUPABASE_ANON_KEY` | Yes      | Same value as the backend's `SUPABASE_ANON_KEY`. |

These are **build-time** variables. After entering them, redeploy the frontend
so Vite can inline them into the bundle. Railway stages variable changes, so
review and deploy the staged changes (or click **Redeploy**) for the backend
after adding its variables too.

`VITE_API_BASE_URL=/api` is set by the IaC file.

## Public domain

Railway IaC does not manage generated `*.up.railway.app` domains. After the
first apply:

1. Open the `frontend` service in Railway.
2. **Settings → Networking → Generate Domain**.
3. Open the generated URL.

No public domain is needed for `backend`, `solver`, or `parser`. If you want to
use Swagger directly, generate a domain for `backend`, then set
`ENABLE_SWAGGER=true`, `SWAGGER_USER`, and `SWAGGER_PASSWORD`.

For a custom frontend domain, add it in Railway and set the backend's
`FRONTEND_URL` to that exact origin (for example
`https://coe-nnect.example.edu`). The default
`CORS_ALLOWED_ORIGINS=https://*.up.railway.app,https://*.vercel.app` covers
generated Railway and Vercel domains.

## Private service URLs

The IaC file uses Railway reference variables:

```text
SOLVER_URL=http://${{solver.RAILWAY_PRIVATE_DOMAIN}}:${{solver.PORT}}
PROSPECTUS_PARSER_URL=http://${{parser.RAILWAY_PRIVATE_DOMAIN}}:${{parser.PORT}}
```

The frontend receives `BACKEND_HOST` and `BACKEND_PORT` as typed references to
the backend service. Railway resolves these at deploy time. If you rename a
service, update the references in `.railway/railway.ts`.

## Checks

```bash
pnpm --filter @coe-nnect/backend typecheck
pnpm --filter @coe-nnect/frontend typecheck
pnpm --filter @coe-nnect/backend build
pnpm --filter @coe-nnect/frontend build
```

Local production-server smoke test (PowerShell):

```powershell
$env:PORT='4173'; $env:BACKEND_HOST='127.0.0.1'; $env:BACKEND_PORT='3000'
node apps/frontend/server.mjs
```

Then open <http://127.0.0.1:4173> and confirm `/api/v1/health` returns
`{"status":"ok", ...}` through the frontend origin.
