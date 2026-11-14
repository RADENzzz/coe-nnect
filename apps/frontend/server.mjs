/**
 * Production server for the Vite build.
 *
 * Railway runs this file after `pnpm --filter @coe-nnect/frontend build`.
 * It serves `dist/` with SPA fallback and proxies `/api` plus `/socket.io` to
 * the backend. The browser stays on one origin, so it does not need a public
 * backend domain, CORS preflights, or a build-time API URL.
 *
 * The proxy prefers Railway's private network (`BACKEND_HOST`/`BACKEND_PORT`)
 * and probes the backend health endpoint before using it. When private
 * networking is unavailable it falls back to `BACKEND_FALLBACK_URL`, which
 * defaults to the production backend's public domain so a broken private
 * route does not turn every `/api` request into a 502.
 */
import { randomBytes } from "node:crypto";
import {
  createReadStream,
  existsSync,
  readFileSync,
  statSync,
} from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { connect as netConnect, isIP } from "node:net";
import { extname, join, resolve, sep } from "node:path";
import { connect as tlsConnect } from "node:tls";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const distDir = resolve(here, "dist");
const indexPath = join(distDir, "index.html");

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const backendHost = process.env.BACKEND_HOST?.trim() || "localhost";
const backendPort = Number.parseInt(process.env.BACKEND_PORT ?? "3000", 10);
const backendProtocol =
  process.env.BACKEND_PROTOCOL?.trim().toLowerCase() === "https"
    ? "https:"
    : "http:";

const DEFAULT_PRODUCTION_BACKEND_FALLBACK_URL =
  "https://coe-nnectbackend-production.up.railway.app";
// Railway injects at least one of these into every service. Falling back on
// them (not only NODE_ENV) keeps the safety net active even when a manually
// created service never set NODE_ENV=production.
const RUNNING_ON_RAILWAY = Boolean(
  process.env.RAILWAY_ENVIRONMENT_ID ||
  process.env.RAILWAY_ENVIRONMENT ||
  process.env.RAILWAY_PROJECT_ID ||
  process.env.RAILWAY_SERVICE_ID,
);
const backendFallbackUrl = (
  process.env.BACKEND_FALLBACK_URL ??
  (RUNNING_ON_RAILWAY || process.env.NODE_ENV === "production"
    ? DEFAULT_PRODUCTION_BACKEND_FALLBACK_URL
    : "")
).trim();

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}
if (!Number.isInteger(backendPort) || backendPort <= 0) {
  throw new Error(`Invalid BACKEND_PORT: ${process.env.BACKEND_PORT}`);
}

/**
 * Supabase may live on a project subdomain (*.supabase.co) or a custom
 * domain. The browser uses HTTPS for REST/auth and WSS for Realtime, so add
 * both schemes for whichever origin this deployment was built against.
 */
function supabaseCspOrigins() {
  const raw = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!raw) return { http: [], ws: [] };
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { http: [], ws: [] };
    }
    const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
    return {
      http: [url.origin],
      ws: [`${wsProtocol}//${url.host}`],
    };
  } catch {
    return { http: [], ws: [] };
  }
}

const SUPABASE_ORIGINS = supabaseCspOrigins();

/**
 * Production Content-Security-Policy for the SPA.
 *
 * - `script-src 'self' 'wasm-unsafe-eval' 'nonce-...'`: the app and the
 *   self-hosted Cap assets are same-origin. The nonce lets Cap's
 *   instrumentation iframe run its inline script; `wasm-unsafe-eval` lets the
 *   solver compile WebAssembly.
 * - `style-src 'unsafe-inline'`: React inline styles and the pre-paint
 *   appearance <style> block need it; Google Fonts serves the stylesheet.
 *   Adding a nonce here would disable `'unsafe-inline'`.
 * - `connect-src`: same-origin API/socket proxy, self-hosted Cap WASM, and
 *   Supabase REST/Realtime.
 * - `worker-src blob:`: PDF.js, export workers, and the Cap proof-of-work
 *   widget create workers from blobs.
 * - `img-src blob:` and `media-src blob:`: generated previews/audio clips.
 */
function buildContentSecurityPolicy(nonce) {
  const scriptSources = ["'self'", "'wasm-unsafe-eval'"];
  if (nonce) scriptSources.push(`'nonce-${nonce}'`);

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    [
      "img-src 'self' data: blob: https://*.supabase.co",
      ...SUPABASE_ORIGINS.http,
    ]
      .filter(Boolean)
      .join(" "),
    "media-src 'self' data: blob:",
    [
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      ...SUPABASE_ORIGINS.http,
      ...SUPABASE_ORIGINS.ws,
    ]
      .filter(Boolean)
      .join(" "),
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");
}

function securityHeaders(nonce) {
  return {
    "Content-Security-Policy": buildContentSecurityPolicy(nonce),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  };
}

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ttf", "font/ttf"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function contentType(filePath) {
  return (
    MIME_TYPES.get(extname(filePath).toLowerCase()) ??
    "application/octet-stream"
  );
}

function isApiPath(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isSocketPath(pathname) {
  return pathname === "/socket.io" || pathname.startsWith("/socket.io/");
}

function safeStaticPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decoded.includes("\0")) return null;

  const relative = decoded.replace(/^\/+/, "");
  const candidate = resolve(distDir, relative);
  if (candidate !== distDir && !candidate.startsWith(`${distDir}${sep}`)) {
    return null;
  }
  return candidate;
}

function cacheControlFor(filePath, isSpaFallback) {
  if (isSpaFallback || filePath === indexPath) {
    return "no-cache, no-store, must-revalidate";
  }
  if (filePath.startsWith(`${join(distDir, "assets")}${sep}`)) {
    return "public, max-age=31536000, immutable";
  }
  if (filePath.startsWith(`${join(distDir, "help")}${sep}`)) {
    return "public, max-age=86400";
  }
  return "no-cache";
}

/**
 * The SPA shell is cached in memory and stamped with a fresh nonce on every
 * response. `theme-boot.js` copies the nonce into `window.CAP_SCRIPT_NONCE`
 * before the Cap widget loads.
 */
let indexHtmlTemplate;

function readIndexHtmlTemplate() {
  if (indexHtmlTemplate !== undefined) return indexHtmlTemplate;
  indexHtmlTemplate = readFileSync(indexPath, "utf8");
  return indexHtmlTemplate;
}

function createNonce() {
  return randomBytes(16).toString("base64");
}

function injectCspNonce(html, nonce) {
  const meta = `<meta name="csp-nonce" content="${nonce}" />`;
  const headTag = /<head(\s[^>]*)?>/i;
  if (headTag.test(html)) {
    return html.replace(headTag, (match) => `${match}\n    ${meta}`);
  }
  return `${meta}\n${html}`;
}

function serveHtml(req, res, isSpaFallback = false) {
  let template;
  try {
    template = readIndexHtmlTemplate();
  } catch (error) {
    console.error(`[frontend] cannot read index.html: ${error.message}`);
    sendJsonError(res, 500, "Frontend build missing");
    return;
  }

  const nonce = createNonce();
  const body = Buffer.from(injectCspNonce(template, nonce), "utf8");

  res.writeHead(200, {
    ...securityHeaders(nonce),
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": cacheControlFor(indexPath, isSpaFallback),
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(body);
}

function sendFile(req, res, filePath, isSpaFallback = false) {
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    sendJsonError(res, 404, "Not found");
    return;
  }

  if (!stat.isFile()) {
    sendJsonError(res, 404, "Not found");
    return;
  }

  if (filePath === indexPath) {
    serveHtml(req, res, isSpaFallback);
    return;
  }

  res.writeHead(200, {
    ...securityHeaders(),
    "Content-Type": contentType(filePath),
    "Content-Length": stat.size,
    "Cache-Control": cacheControlFor(filePath, isSpaFallback),
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  const stream = createReadStream(filePath);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

function sendJsonError(res, statusCode, message) {
  if (res.headersSent || res.writableEnded || res.destroyed) {
    res.destroy();
    return;
  }
  res.writeHead(statusCode, {
    ...securityHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify({ error: message }));
}

function serveStatic(req, res, pathname) {
  const candidate = safeStaticPath(pathname);
  if (!candidate) {
    sendJsonError(res, 403, "Forbidden");
    return;
  }

  let filePath = candidate;
  try {
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      const indexFile = join(filePath, "index.html");
      filePath = existsSync(indexFile) ? indexFile : "";
    }
  } catch {
    filePath = "";
  }

  if (filePath) {
    sendFile(req, res, filePath);
    return;
  }

  // Unknown path with a file extension is a real 404. Extensionless paths are
  // client-side routes and fall back to index.html.
  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (lastSegment.includes(".")) {
    sendJsonError(res, 404, "Not found");
    return;
  }

  sendFile(req, res, indexPath, true);
}

/**
 * Backend targets. The primary target is the Railway private network; the
 * fallback is the public backend domain. The probe is cached so healthy
 * requests do not pay for a health check every time.
 */
function hostHeader(target) {
  const defaultPort = target.protocol === "https:" ? 443 : 80;
  return target.port === defaultPort
    ? target.host
    : `${target.host}:${target.port}`;
}

function tlsOptions(target) {
  if (target.protocol !== "https:" || isIP(target.host) !== 0) return {};
  return { servername: target.host };
}

function parseFallbackTarget(raw) {
  if (!raw) return null;

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid BACKEND_FALLBACK_URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`BACKEND_FALLBACK_URL must be http(s): ${raw}`);
  }

  const fallbackPort = Number.parseInt(
    url.port || (url.protocol === "https:" ? "443" : "80"),
    10,
  );
  if (!Number.isInteger(fallbackPort) || fallbackPort <= 0) {
    throw new Error(`Invalid BACKEND_FALLBACK_URL port: ${raw}`);
  }

  return {
    name: "fallback",
    protocol: url.protocol,
    host: url.hostname,
    port: fallbackPort,
    basePath: url.pathname.replace(/\/+$/, ""),
  };
}

const primaryBackend = {
  name: "private",
  protocol: backendProtocol,
  host: backendHost,
  port: backendPort,
  basePath: "",
};

const fallbackBackend = parseFallbackTarget(backendFallbackUrl);

const BACKEND_PROBE_PATH = "/api/v1/health";
const BACKEND_PROBE_TIMEOUT_MS = 3_000;
const BACKEND_PROBE_TTL_MS = 60_000;

let activeBackend = null;
let activeBackendCheckedAt = 0;
let backendProbe = null;

function probeTarget(target) {
  return new Promise((resolveProbe) => {
    const transport =
      target.protocol === "https:" ? httpsRequest : httpRequest;
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolveProbe(ok);
    };

    const probe = transport(
      {
        protocol: target.protocol,
        hostname: target.host,
        port: target.port,
        method: "GET",
        path: `${target.basePath}${BACKEND_PROBE_PATH}`,
        headers: {
          host: hostHeader(target),
          accept: "application/json",
        },
        timeout: BACKEND_PROBE_TIMEOUT_MS,
        ...tlsOptions(target),
      },
      (probeRes) => {
        probeRes.resume();
        const status = probeRes.statusCode ?? 0;
        finish(status >= 200 && status < 400);
      },
    );

    probe.on("timeout", () => probe.destroy(new Error("probe timeout")));
    probe.on("error", () => finish(false));
    probe.end();
  });
}

async function selectBackend() {
  if (!fallbackBackend) return primaryBackend;

  if (
    activeBackend &&
    Date.now() - activeBackendCheckedAt < BACKEND_PROBE_TTL_MS
  ) {
    return activeBackend;
  }
  if (backendProbe) return backendProbe;

  backendProbe = (async () => {
    const privateOk = await probeTarget(primaryBackend);
    const next = privateOk ? primaryBackend : fallbackBackend;
    activeBackend = next;
    activeBackendCheckedAt = Date.now();
    console.log(
      `[frontend] backend target: ${next.name} ` +
        `${next.protocol}//${hostHeader(next)}` +
        (privateOk ? "" : " (private health probe failed)"),
    );
    return next;
  })();

  try {
    return await backendProbe;
  } finally {
    backendProbe = null;
  }
}

function invalidateBackend(target) {
  if (target === primaryBackend && fallbackBackend) {
    activeBackendCheckedAt = 0;
  }
}

async function proxyHttp(req, res) {
  let target;
  try {
    target = await selectBackend();
  } catch (error) {
    console.error(`[frontend] backend selection failed: ${error.message}`);
    sendJsonError(res, 502, "Backend unavailable");
    return;
  }

  if (req.destroyed || res.writableEnded || res.destroyed) return;

  const headers = { ...req.headers };
  for (const header of HOP_BY_HOP_HEADERS) delete headers[header];

  headers.host = hostHeader(target);
  headers["x-forwarded-host"] = req.headers.host ?? "";
  headers["x-forwarded-proto"] =
    req.headers["x-forwarded-proto"] ??
    (req.socket.encrypted ? "https" : "http");
  headers["x-forwarded-for"] =
    req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "";

  const transport = target.protocol === "https:" ? httpsRequest : httpRequest;
  const proxyReq = transport(
    {
      protocol: target.protocol,
      hostname: target.host,
      port: target.port,
      method: req.method,
      path: `${target.basePath}${req.url ?? "/"}`,
      headers,
      ...tlsOptions(target),
    },
    (proxyRes) => {
      const responseHeaders = {
        ...securityHeaders(),
        ...proxyRes.headers,
      };
      for (const header of HOP_BY_HOP_HEADERS) delete responseHeaders[header];

      res.writeHead(proxyRes.statusCode ?? 502, responseHeaders);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", (error) => {
    console.error(
      `[frontend] ${target.name} backend proxy error: ${error.message}`,
    );
    invalidateBackend(target);
    sendJsonError(res, 502, "Backend unavailable");
  });

  req.on("aborted", () => proxyReq.destroy());
  req.pipe(proxyReq);
}

async function proxyWebSocket(req, socket, head) {
  let target;
  try {
    target = await selectBackend();
  } catch (error) {
    console.error(`[frontend] backend selection failed: ${error.message}`);
    socket.destroy();
    return;
  }

  if (socket.destroyed) return;

  const connect = target.protocol === "https:" ? tlsConnect : netConnect;
  const upstream = connect(
    {
      host: target.host,
      port: target.port,
      ...tlsOptions(target),
    },
    () => {
      const headers = { ...req.headers };
      headers.host = hostHeader(target);
      headers["x-forwarded-host"] = req.headers.host ?? "";
      headers["x-forwarded-proto"] =
        req.headers["x-forwarded-proto"] ??
        (socket.encrypted ? "https" : "http");
      headers["x-forwarded-for"] =
        req.headers["x-forwarded-for"] ?? socket.remoteAddress ?? "";

      const lines = [`GET ${target.basePath}${req.url ?? "/"} HTTP/1.1`];
      for (const [key, value] of Object.entries(headers)) {
        if (Array.isArray(value)) {
          for (const item of value) lines.push(`${key}: ${item}`);
        } else if (value !== undefined) {
          lines.push(`${key}: ${value}`);
        }
      }
      lines.push("", "");

      upstream.write(lines.join("\r\n"));
      if (head.length > 0) upstream.write(head);

      socket.setNoDelay(true);
      upstream.setNoDelay(true);
      upstream.pipe(socket);
      socket.pipe(upstream);
    },
  );

  upstream.on("error", (error) => {
    console.error(
      `[frontend] ${target.name} websocket proxy error: ${error.message}`,
    );
    invalidateBackend(target);
    socket.destroy();
  });
  socket.on("error", () => upstream.destroy());
  socket.on("close", () => upstream.destroy());
  upstream.on("close", () => socket.destroy());
}

async function handleRequest(req, res) {
  let pathname;
  try {
    pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  } catch {
    sendJsonError(res, 400, "Bad request");
    return;
  }

  if (isApiPath(pathname) || isSocketPath(pathname)) {
    await proxyHttp(req, res);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJsonError(res, 405, "Method not allowed");
    return;
  }

  serveStatic(req, res, pathname);
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error(`[frontend] request failed: ${error.stack ?? error}`);
    sendJsonError(res, 500, "Internal server error");
  });
});

server.on("upgrade", (req, socket, head) => {
  let pathname;
  try {
    pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  } catch {
    socket.destroy();
    return;
  }

  if (!isSocketPath(pathname)) {
    socket.destroy();
    return;
  }

  proxyWebSocket(req, socket, head).catch((error) => {
    console.error(`[frontend] websocket upgrade failed: ${error.message}`);
    socket.destroy();
  });
});

if (fallbackBackend) {
  await selectBackend().catch((error) => {
    console.error(`[frontend] initial backend probe failed: ${error.message}`);
  });
}

server.listen(port, "0.0.0.0", () => {
  console.log(`[frontend] listening on 0.0.0.0:${port}`);
  console.log(
    `[frontend] proxying /api and /socket.io to ${primaryBackend.name} ` +
      `${primaryBackend.protocol}//${hostHeader(primaryBackend)}`,
  );
  if (fallbackBackend) {
    console.log(
      `[frontend] fallback backend: ` +
        `${fallbackBackend.protocol}//${hostHeader(fallbackBackend)}`,
    );
  }
});

function shutdown(signal) {
  console.log(`[frontend] received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
