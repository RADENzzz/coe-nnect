/**
 * Production server for the Vite build.
 *
 * Railway runs this file after `pnpm --filter @coe-nnect/frontend build`.
 * It serves `dist/` with SPA fallback and proxies `/api` plus `/socket.io` to
 * the backend over Railway's private network. Keeping the browser on one
 * origin means the frontend does not need a public backend domain, CORS
 * preflights, or a build-time API URL that changes with every deployment.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { connect as netConnect } from "node:net";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const distDir = resolve(here, "dist");

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const backendHost = process.env.BACKEND_HOST?.trim() || "localhost";
const backendPort = Number.parseInt(process.env.BACKEND_PORT ?? "3000", 10);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}
if (!Number.isInteger(backendPort) || backendPort <= 0) {
  throw new Error(`Invalid BACKEND_PORT: ${process.env.BACKEND_PORT}`);
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

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
  if (isSpaFallback || filePath === join(distDir, "index.html")) {
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

  res.writeHead(200, {
    ...SECURITY_HEADERS,
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
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(statusCode, {
    ...SECURITY_HEADERS,
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

  sendFile(req, res, join(distDir, "index.html"), true);
}

function proxyHttp(req, res) {
  const headers = { ...req.headers };
  for (const header of HOP_BY_HOP_HEADERS) delete headers[header];

  headers.host = `${backendHost}:${backendPort}`;
  headers["x-forwarded-host"] = req.headers.host ?? "";
  headers["x-forwarded-proto"] =
    req.headers["x-forwarded-proto"] ??
    (req.socket.encrypted ? "https" : "http");
  headers["x-forwarded-for"] =
    req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "";

  const proxyReq = httpRequest(
    {
      host: backendHost,
      port: backendPort,
      method: req.method,
      path: req.url,
      headers,
    },
    (proxyRes) => {
      const responseHeaders = {
        ...SECURITY_HEADERS,
        ...proxyRes.headers,
      };
      for (const header of HOP_BY_HOP_HEADERS) delete responseHeaders[header];

      res.writeHead(proxyRes.statusCode ?? 502, responseHeaders);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", (error) => {
    console.error(`[frontend] backend proxy error: ${error.message}`);
    sendJsonError(res, 502, "Backend unavailable");
  });

  req.on("aborted", () => proxyReq.destroy());
  req.pipe(proxyReq);
}

function proxyWebSocket(req, socket, head) {
  const upstream = netConnect({ host: backendHost, port: backendPort }, () => {
    const headers = { ...req.headers };
    headers.host = `${backendHost}:${backendPort}`;
    headers["x-forwarded-host"] = req.headers.host ?? "";
    headers["x-forwarded-proto"] =
      req.headers["x-forwarded-proto"] ?? (socket.encrypted ? "https" : "http");
    headers["x-forwarded-for"] =
      req.headers["x-forwarded-for"] ?? socket.remoteAddress ?? "";

    const lines = [`GET ${req.url} HTTP/1.1`];
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
  });

  upstream.on("error", (error) => {
    console.error(`[frontend] websocket proxy error: ${error.message}`);
    socket.destroy();
  });
  socket.on("error", () => upstream.destroy());
  socket.on("close", () => upstream.destroy());
  upstream.on("close", () => socket.destroy());
}

const server = createServer((req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  } catch {
    sendJsonError(res, 400, "Bad request");
    return;
  }

  if (isApiPath(pathname) || isSocketPath(pathname)) {
    proxyHttp(req, res);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJsonError(res, 405, "Method not allowed");
    return;
  }

  serveStatic(req, res, pathname);
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

  proxyWebSocket(req, socket, head);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[frontend] listening on 0.0.0.0:${port}`);
  console.log(
    `[frontend] proxying /api and /socket.io to ${backendHost}:${backendPort}`,
  );
});

function shutdown(signal) {
  console.log(`[frontend] received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
