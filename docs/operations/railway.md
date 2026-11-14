# Railway deployment

The Railway project is defined with **Infrastructure as Code** in
[`.railway/railway.ts`](../../.railway/railway.ts). Railway's older
`railway.json` / `railway.toml` format is deprecated and stops being read on
2026-12-01, so the per-package `railway.json` files have been removed.

## Services

| Service             | Source                       | Public? | Healthcheck      |
| ------------------- | ---------------------------- | ------- | ---------------- |
| `coe-nnectfrontend` | repo root (Vite build + Node server) | Yes     | `/`              |
| `coe-nnectbackend`  | repo root (NestJS build)     | No      | `/api/v1/health` |
| `coe-nnectsolver`   | `packages/solver-service`    | No      | `/health`        |
| `coe-nnectparser`   | `packages/prospectus-parser` | No      | `/health`        |

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
file are named `coe-nnectfrontend`, `coe-nnectbackend`, `coe-nnectsolver`, and
`coe-nnectparser`; rename or remove older services with different names before
applying if you want to keep the same project tidy.

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
| `CAP_SECRET`                | Yes      | Cap signing secret, at least 16 bytes. Login fails closed without it. |
| `GITHUB_TOKEN`              | No       | Raises GitHub API limits for the repo stats endpoints. |
| `FRONTEND_URL`              | No       | Exact frontend origin, for a custom domain.            |
| `ENABLE_SWAGGER`            | No       | Set to `true` only together with the next two values.  |
| `SWAGGER_USER`              | No       | Basic-auth user for production Swagger.                |
| `SWAGGER_PASSWORD`          | No       | Basic-auth password for production Swagger.            |
| `CORS_ALLOW_TUNNEL`         | No       | `true` only for temporary Cloudflare tunnel demos.     |
| `IDP_ENABLED`               | No       | Enable Pattern A pulls and the refresh action.         |
| `IDP_BASE_URL`, `IDP_API_KEY` | No     | Pattern A endpoint and bearer token.                   |
| `IDP_DEVICE_API_KEY`        | No       | Pattern C device bearer key.                           |
| `IDP_WEBHOOK_SECRET`        | No       | HMAC secret for inbound IDP webhooks.                  |

`DATABASE_SSL=true`, `NODE_ENV=production`, `API_PREFIX=api`,
`TRUST_PROXY=1`, the CORS allowlist, and the private solver/parser URLs are set
by the IaC file. The variables above are declared with `preserve()` so values
entered in the dashboard survive future applies.

### Frontend service

| Variable                 | Required | Notes                                            |
| ------------------------ | -------- | ------------------------------------------------ |
| `VITE_SUPABASE_URL`      | Yes      | Same value as the backend's `SUPABASE_URL`.      |
| `VITE_SUPABASE_ANON_KEY` | Yes      | Same value as the backend's `SUPABASE_ANON_KEY`. |
| `BACKEND_FALLBACK_URL`   | No       | Public backend origin used when the private probe fails. Defaults to the production backend domain in `server.mjs`. |

These are **build-time** variables. After entering them, redeploy the frontend
so Vite can inline them into the bundle. Railway stages variable changes, so
review and deploy the staged changes (or click **Redeploy**) for the backend
after adding its variables too.

`VITE_API_BASE_URL=/api` is set by the IaC file. If the dashboard still has an
older absolute value such as
`https://coe-nnectbackend-production.up.railway.app/api`, change it to `/api`
or re-apply the IaC before redeploying. The browser cannot reach Railway's
private network, and the production CSP intentionally blocks cross-origin API
calls. `resolveApiBaseUrl()` also falls back to `/api` at runtime for a
cross-origin `*.up.railway.app` API URL, but the build-time value should still
be corrected.

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
`CORS_ALLOWED_ORIGINS=https://*.up.railway.app` covers generated Railway
domains. Add any other exact origin through `CORS_ALLOWED_ORIGINS`.

## Private service URLs

The IaC file uses Railway reference variables:

```text
SOLVER_URL=http://${{coe-nnectsolver.RAILWAY_PRIVATE_DOMAIN}}:${{coe-nnectsolver.PORT}}
PROSPECTUS_PARSER_URL=http://${{coe-nnectparser.RAILWAY_PRIVATE_DOMAIN}}:${{coe-nnectparser.PORT}}
```

The frontend receives `BACKEND_HOST` and `BACKEND_PORT` as typed references to
the backend service. Railway resolves these at deploy time. If you rename a
service, update the references in `.railway/railway.ts`.

At startup `server.mjs` probes `GET /api/v1/health` on the private target. If
the probe fails, it proxies `/api` and `/socket.io` to
`BACKEND_FALLBACK_URL` instead (the backend's public origin) and re-probes the
private target every 60 seconds. A proxy error also forces a re-probe on the
next request. This keeps the frontend working when private networking is
misconfigured while still preferring the private route when it is healthy.

## Troubleshooting

- **`/api/...` returns 502 through the frontend.** Check the frontend logs for
  `backend target: ...`. If the private probe failed, confirm the backend
  service is running and that `BACKEND_HOST`/`BACKEND_PORT` match its private
  domain and port. As a safety net, set `BACKEND_FALLBACK_URL` to the
  backend's public origin.
- **Browser reports `ERR_NETWORK` or a CSP `connect-src` violation for the
  backend.** The frontend bundle was built with an absolute
  `VITE_API_BASE_URL`. Set it to `/api` and redeploy the frontend.
- **CAP widget fails with `instr_csp_blocked` or cannot load WASM.** The
  production CSP must include `'wasm-unsafe-eval'` and a per-request nonce;
  `server.mjs` injects both. The WASM and pako files are self-hosted under
  `apps/frontend/public/cap/`, so no CDN source is required.

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
$env:BACKEND_FALLBACK_URL=''
node apps/frontend/server.mjs
```

Then open <http://127.0.0.1:4173> and confirm `/api/v1/health` returns
`{"status":"ok", ...}` through the frontend origin.
