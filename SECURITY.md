# Security policy

CoE-NNECT handles academic records, faculty data, schedules, and account credentials for the WMSU College of Engineering. We take security reports seriously and ask that you give us a reasonable opportunity to investigate and fix an issue before public disclosure.

## Supported versions

| Version | Supported |
| --- | --- |
| Latest `main` branch | Yes |
| Deployed Railway services built from `main` | Yes |
| Older commits, forks, and local modifications | No |

Security fixes are applied to `main` and deployed from there. There are no maintained release branches. If you are running an older fork, rebase onto `main` before reporting an issue that may already be fixed.

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

Use GitHub's private vulnerability reporting:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Include the affected area, reproduction steps, impact, and any proof-of-concept details.

If private reporting is unavailable, contact the project maintainers listed in the [README](README.md#project-team) through a private channel and ask for a secure way to share the report. Do not include secrets, personal data, or exploit details in a public issue.

Please include:

- the affected route, page, service, or migration;
- the version, commit, or deployment where you observed it;
- prerequisites such as role, department state, or feature flags;
- clear reproduction steps and the observed versus expected behavior;
- the security impact you believe is possible;
- any suggested fix or mitigation;
- whether you want public credit.

## What to expect

These are best-effort targets for a capstone project, not a commercial support contract:

| Stage | Target |
| --- | --- |
| Acknowledgement of the report | Within 3 business days |
| Initial triage and severity assessment | Within 7 business days |
| Status update | At least every 10 business days while the report is open |
| Fix or mitigation | Based on severity and deployment risk; critical issues are prioritized |

We will tell you whether we can reproduce the issue, ask for clarification when needed, and coordinate disclosure after a fix is available. Please do not test against production data, disrupt other users, or access data that is not yours.

## Scope

In scope:

- the React frontend in `apps/frontend`;
- the NestJS API in `apps/backend`;
- the prospectus parser and solver services in `packages/`;
- Supabase migrations, RLS policies, and database functions in `supabase/`;
- Railway and deployment configuration in `.railway/` and `scripts/`;
- authentication, authorization, session handling, and Cap CAPTCHA flows.

Out of scope:

- vulnerabilities in Supabase, Railway, Cloudflare, Tesseract, OR-Tools, or other third-party services that are not caused by this repository's configuration;
- reports that require a compromised browser, operating system, or Supabase service-role key;
- missing security headers on non-production previews with no sensitive data;
- social engineering, physical access, or denial-of-service volume attacks;
- automated scanner output without a reproducible impact;
- issues in forks or deployments that do not track `main`.

## Implemented controls

The current codebase includes:

- **Authentication:** Supabase Auth email/password sign-in with a Cap CAPTCHA challenge. Cap is fail-closed when `CAP_SECRET` is missing or shorter than 16 bytes. Challenges and redeem tokens expire after 10 minutes, and `cap_nonce` / `cap_token` make each solution single-use.
- **Authorization:** `JwtAuthGuard` is registered globally and verifies Supabase access tokens; routes opt out explicitly with `@Public()`. `RolesGuard` loads the active application profile and enforces role checks on the API. Browser route guards are navigation aids, not the security boundary.
- **Role model:** `college_dean`, `college_secretary`, `department_head`, `viewer`, and the hidden `administrator`. The administrator account is restricted to Dev Tools and excluded from user-facing chat.
- **Database access:** TypeORM uses a trusted server-side connection. Direct Supabase clients are governed by RLS; `REVOKE USAGE ON SCHEMA public FROM PUBLIC` limits schema reachability. API-internal tables (`cap_nonce`, `cap_token`, `user_presence`, and the IDP state tables) enable RLS with no client policies and no `anon`/`authenticated` grants.
- **Input handling:** global Nest validation with DTO whitelisting; unknown properties are rejected. PDF uploads are size-limited and parser requests validate region geometry.
- **Transport and headers:** Helmet on the API and a strict Content-Security-Policy on the production frontend server (`script-src 'self'`, no inline scripts), HSTS in production, no-referrer policy, frame-ancestor denial, and an explicit CORS allowlist. `TRUST_PROXY` is set only behind the trusted frontend proxy.
- **Rate limiting:** global HTTP throttling, a stricter login bucket, and a separate Cap bucket.
- **Webhook security:** IDP webhooks use HMAC-SHA256 over the raw request body with a timestamp tolerance; Pattern C device endpoints require a device bearer key.
- **Secret handling:** secrets live in environment variables or the Railway dashboard, never in tracked files. `VITE_*` values are treated as public. The service-role key is backend-only.
- **Audit and logging:** privileged mutations write to `audit_trail`. Production logs are structured JSON with a request correlation id and do not include bodies, bearer tokens, or service-role keys.
- **Database workflow:** migrations are reviewed and validated on a clean database in CI; TypeORM `synchronize` is disabled.
- **Dependency and build checks:** CI runs backend build/type-checks/tests, frontend lint/type-check/build, migration validation, and the Playwright workflow.

## Known limitations

- This is a capstone project. It has not undergone a formal third-party penetration test or a bug-bounty program.
- The demo seed uses shared demo passwords for local evaluation. Never deploy the demo accounts to a public production environment without changing their credentials.
- Dev Tools exposes destructive reset and seed operations to the hidden administrator account. Keep that account restricted, use a strong password, and do not enable development bypasses in production.
- Supabase, Railway, Cloudflare, and the university IDP are external trust boundaries. Their own security advisories and configuration guidance apply.
- The frontend bundle is public by design. Do not place secrets in any `VITE_*` variable.
- `supabase-js` persists the access and refresh tokens in browser `localStorage`. A successful XSS could therefore steal a session. The production CSP and dependency hygiene reduce that risk, but an httpOnly-cookie backend-for-frontend remains the stronger long-term architecture.

## Safe harbor

We will not pursue legal action against researchers who:

- act in good faith and follow this policy;
- test only accounts and data they own or are explicitly authorized to use;
- avoid privacy violations, data destruction, and service disruption;
- report findings privately and allow reasonable time for a fix.

This policy does not authorize testing against third-party services or data outside the CoE-NNECT project.

## Related documentation

- [Contributing](CONTRIBUTING.md) — validation expectations and secret-handling rules.
- [Backend security controls](docs/apps/backend.md#security-and-observability) — CORS, Swagger, CSP, rate limits, and logging.
- [Database structure](docs/DATABASE%20STRUCTURE/README.md) — RLS and API-internal tables.
- [IDP integration](docs/integrations/idp.md) — HMAC webhooks, device auth, and idempotency.
- [Railway deployment](docs/operations/railway.md) — production variables and service exposure.
