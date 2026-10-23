import { defineRailway, github, preserve, project, service } from "railway/iac";

/**
 * Railway Infrastructure as Code for the CoE-NNECT deployment.
 *
 * Apply from the repository root with Railway CLI 5.42.1 or newer:
 *
 *   railway link
 *   railway config plan
 *   railway config apply
 *
 * The four services:
 *   coe-nnectfrontend - Vite build served by apps/frontend/server.mjs (public)
 *   coe-nnectbackend  - NestJS API (private; the frontend proxies /api and /socket.io)
 *   coe-nnectsolver   - FastAPI scheduling solver (private)
 *   coe-nnectparser   - FastAPI prospectus parser (private)
 *
 * Secrets are intentionally NOT stored in this file. Variables declared with
 * preserve() keep whatever value you enter in the Railway dashboard, so they
 * survive future `railway config apply` runs.
 */
const REPOSITORY = "RADENzzz/coe-nnect";
const BRANCH = "main";

export default defineRailway((ctx) => {
  // ── Python services ────────────────────────────────────────────────────
  // Each package has its own Dockerfile; Railway builds it with the package
  // directory as the Docker build context.
  const solver = service("coe-nnectsolver", {
    source: github(REPOSITORY, {
      branch: BRANCH,
      rootDirectory: "packages/solver-service",
    }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
    },
    deploy: {
      healthcheckPath: "/health",
      healthcheckTimeout: 30,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
    },
  });

  const parser = service("coe-nnectparser", {
    source: github(REPOSITORY, {
      branch: BRANCH,
      rootDirectory: "packages/prospectus-parser",
    }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
    },
    deploy: {
      healthcheckPath: "/health",
      healthcheckTimeout: 30,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
    },
  });

  // ── NestJS API ─────────────────────────────────────────────────────────
  // The backend lives in a pnpm workspace and depends on the local
  // @coe-nnect/constraint-rules package, so the build context stays at the
  // repository root.
  const backend = service("coe-nnectbackend", {
    source: github(REPOSITORY, { branch: BRANCH }),
    build: "pnpm --filter @coe-nnect/backend build",
    start: "node apps/backend/dist/main.js",
    healthcheck: "/api/v1/health",
    healthcheckTimeout: 60,
    deploy: {
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
    },
    env: {
      NODE_ENV: "production",
      API_PREFIX: "api",
      DATABASE_SSL: "true",

      // Filled in from the Railway dashboard.
      DATABASE_URL: preserve(),
      SUPABASE_URL: preserve(),
      SUPABASE_ANON_KEY: preserve(),
      SUPABASE_SERVICE_ROLE_KEY: preserve(),
      FRONTEND_URL: preserve(),
      GITHUB_TOKEN: preserve(),
      ENABLE_SWAGGER: preserve(),
      SWAGGER_USER: preserve(),
      SWAGGER_PASSWORD: preserve(),
      CORS_ALLOW_TUNNEL: preserve(),

      // The browser talks to the frontend origin; the frontend Node server
      // proxies /api and /socket.io over Railway's private network. The
      // wildcard keeps the generated frontend domain (and any existing Vercel
      // deployment) allowed by the HTTP + Socket.IO origin checks.
      CORS_ALLOWED_ORIGINS: "https://*.up.railway.app,https://*.vercel.app",

      // Railway reference variables resolve to the private DNS name and the
      // platform-assigned port at deploy time.
      SOLVER_URL:
        "http://${{coe-nnectsolver.RAILWAY_PRIVATE_DOMAIN}}:${{coe-nnectsolver.PORT}}",
      PROSPECTUS_PARSER_URL:
        "http://${{coe-nnectparser.RAILWAY_PRIVATE_DOMAIN}}:${{coe-nnectparser.PORT}}",

      // The frontend proxy is one hop in front of the backend.
      TRUST_PROXY: "1",
      LOG_FORMAT: "json",
      GITHUB_REPO_OWNER: "RADENzzz",
      GITHUB_REPO_NAME: "coe-nnect",
    },
  });

  // ── Vite frontend ──────────────────────────────────────────────────────
  // apps/frontend/server.mjs serves the static build with SPA fallback and
  // proxies API + WebSocket traffic to the backend's private domain. This
  // keeps the browser on one origin, so no CORS or public backend domain is
  // required.
  const frontend = service("coe-nnectfrontend", {
    source: github(REPOSITORY, { branch: BRANCH }),
    build: "pnpm --filter @coe-nnect/frontend build",
    start: "node apps/frontend/server.mjs",
    healthcheck: "/",
    healthcheckTimeout: 30,
    deploy: {
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
    },
    env: {
      NODE_ENV: "production",

      // Build-time Vite values. VITE_API_BASE_URL is a same-origin path so the
      // bundle works on any generated Railway domain.
      VITE_API_BASE_URL: "/api",
      VITE_SUPABASE_URL: preserve(),
      VITE_SUPABASE_ANON_KEY: preserve(),

      // Runtime proxy targets, resolved from the backend service by Railway.
      BACKEND_HOST: backend.env.RAILWAY_PRIVATE_DOMAIN,
      BACKEND_PORT: backend.env.PORT,
    },
  });

  return project(ctx.projectName ?? "coe-nnect", {
    resources: [solver, parser, backend, frontend],
  });
});
