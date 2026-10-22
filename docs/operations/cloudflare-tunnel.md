# Temporary public link with Cloudflare Tunnel

Two ways to run the app:

| Command           | What you get                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`        | Local only — `http://localhost:5173`                                                                           |
| `pnpm online`     | A temporary public `https://<random-words>.trycloudflare.com` link for the app that is already running locally |
| `pnpm dev:online` | Both at once, in a single terminal                                                                             |

The public link uses a Cloudflare **quick tunnel**: no Cloudflare account, no
domain, no DNS setup. It forwards to your local Vite server, which proxies the
API and websocket traffic, so the whole app works through one URL.

The URL is temporary — it changes every time cloudflared restarts.

## 1. Install cloudflared (once)

| Platform      | Command                                                                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows       | `winget install --id Cloudflare.cloudflared`                                                                                                                |
| macOS         | `brew install cloudflared`                                                                                                                                  |
| Debian/Ubuntu | `curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb && sudo dpkg -i cloudflared.deb` |

Close and reopen the terminal so `cloudflared` is on `PATH`, then check:

```powershell
cloudflared --version
```

## 2. Go online

Start the app as usual:

```powershell
pnpm dev
```

In a second terminal, while it runs:

```powershell
pnpm online
```

The tunnel command prints:

```text
  ──────────────────────────────────────────────────────────
  │ Online — temporary public link
  │ https://calm-river-1234.trycloudflare.com
  │ Share it with anyone. It works while this command runs.
  │ The URL changes every time you restart it.
  ──────────────────────────────────────────────────────────
```

Share that link. `Ctrl+C` in the tunnel terminal closes the public link; the
local app keeps running.

To start everything from one terminal instead:

```powershell
pnpm dev:online
```

That is the same as `pnpm dev --tunnel`; it also pins Vite to port `5173`
(fail-fast instead of silently moving to `5174`, which the tunnel could not
reach) and makes HMR connect over `wss://<tunnel>/`.

## 3. Why it works with a plain `pnpm dev`

No environment changes are needed:

- Vite accepts `*.trycloudflare.com` host headers (`allowedHosts`) and proxies
  `/api` and `/socket.io` (websockets) to `localhost:3000` — in both `dev` and
  `preview`.
- The browser keeps talking to one origin. `VITE_API_BASE_URL` may stay
  `http://localhost:3000/api`: when the page is opened from another host and the
  configured API is a loopback address, the frontend falls back to the
  same-origin `/api` path (see `apps/frontend/src/lib/api-base.ts`). Socket.IO
  follows the same origin.
- Outside production the backend accepts `https://*.trycloudflare.com` origins
  automatically. In a deployed/production backend, allow it explicitly with
  `CORS_ALLOW_TUNNEL=true` (demo only).
- Password reset and other Supabase links use `window.location.origin`, so they
  point at the tunnel automatically once Supabase allows it (step 4).

With plain `pnpm dev`, live-reload (HMR) may not reconnect through the tunnel.
The app itself, login, API calls, websockets, and notifications all work. Use
`pnpm dev:online` when you are actively editing while sharing.

## 4. Supabase redirect URLs (password reset)

In **Supabase Dashboard → Authentication → URL Configuration**, add a wildcard
entry to _Redirect URLs_:

```text
https://*.trycloudflare.com/**
```

Needed once, safely left in place. Without it the reset email link returns to
the Supabase default site instead of the tunnel.

## Advanced overrides

| Variable                              | Default                 | Purpose                                                                               |
| ------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------- |
| `TUNNEL_TARGET` / `pnpm online <url>` | `http://localhost:5173` | Forward the tunnel to another port (e.g. `http://localhost:4173` for `vite preview`). |
| `VITE_API_PROXY_TARGET`               | `http://localhost:3000` | Where the Vite proxy sends `/api` and `/socket.io`.                                   |
| `VITE_ALLOWED_HOSTS`                  | —                       | Extra comma-separated hostnames Vite should accept (custom tunnel domain, ngrok, …).  |
| `CORS_ALLOW_TUNNEL`                   | auto outside production | Backend accepts `https://*.trycloudflare.com` origins.                                |

## Limits and caveats

- **The link is public.** Anyone with it reaches the login page; the API still
  requires a Supabase JWT, but treat demo links as public. Close the tunnel when
  you are done and keep `CORS_ALLOW_TUNNEL` off in production.
- **New URL on every restart.** Old bookmarks and email links stop working.
- **~100 second request limit.** Cloudflare closes proxied requests that take
  longer than 100 s (HTTP 524). Automatic schedule generation has a 150 s client
  timeout locally, so a large solve may time out through the tunnel. Prospectus
  extraction (120 s limit) is also close to the edge.
- **Uploads** are fine for this app's PDF sizes; Cloudflare's request body limit
  is 100 MB on the free plan.
- **Rate limiting** uses the client address forwarded by cloudflared. Set
  `TRUST_PROXY=true` in `apps/backend/.env` when the backend runs behind the
  tunnel outside dev (Vercel already sets it).
- **Port already in use in `pnpm dev:online`.** Tunnel mode pins Vite to `5173`
  and stops with an error instead of switching ports. Free it (`pnpm kill`) and
  retry.

## Troubleshooting

| Symptom                                                             | Fix                                                                                                                                                      |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `✖ Nothing is answering on http://localhost:5173`                   | Start `pnpm dev` first, or use `pnpm dev:online`.                                                                                                        |
| `Building a tunnel` error 1033 / 502 in the browser                 | The local service is down or on another port. Check the local terminal.                                                                                  |
| `Blocked request. This host ("…trycloudflare.com") is not allowed.` | Vite's `allowedHosts` no longer has the host. `.trycloudflare.com` is allowed by default; custom hosts go in `VITE_ALLOWED_HOSTS`.                       |
| Browser console: CORS error on `/api/...`                           | Backend is running with `NODE_ENV=production` without `CORS_ALLOW_TUNNEL=true`.                                                                          |
| Login works but notifications are dead                              | `/socket.io` is not reaching the backend. Confirm `pnpm dev:backend` runs on `3000` and the Vite proxy is active.                                        |
| Pages load but every API call fails                                 | `VITE_API_BASE_URL` points at a non-loopback URL that the viewer cannot reach. Use `http://localhost:3000/api` (auto-falls back to the proxy) or `/api`. |
| `cloudflared` not recognized                                        | Reinstall and reopen the terminal so `PATH` refreshes.                                                                                                   |
