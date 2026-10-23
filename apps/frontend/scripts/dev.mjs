/**
 * Frontend dev/start entry point.
 *
 * Railway's frontend service is configured to run `pnpm dev` in some
 * environments. That is fine for local development, but on Railway it must
 * serve the built app through `server.mjs` so `/api` and `/socket.io` are
 * proxied to the backend. Detect the Railway runtime and switch to the
 * production server automatically; local `pnpm dev` still starts Vite.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const viteBin = resolve(root, "node_modules", "vite", "bin", "vite.js");
const distEntry = resolve(root, "dist", "index.html");

const isRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_SERVICE_NAME ||
    process.env.RAILWAY_PROJECT_ID,
);

if (isRailway) {
  if (!existsSync(distEntry)) {
    if (!existsSync(viteBin)) {
      console.error(
        "[frontend] dist/ is missing and Vite is not installed; run the frontend build before starting.",
      );
      process.exit(1);
    }
    console.log("[frontend] dist/ is missing; building before startup...");
    const build = spawnSync(process.execPath, [viteBin, "build"], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    if (build.status !== 0) {
      process.exit(build.status ?? 1);
    }
  }

  await import("../server.mjs");
} else {
  if (!existsSync(viteBin)) {
    console.error("[frontend] Vite is not installed; run pnpm install first.");
    process.exit(1);
  }

  const child = spawn(
    process.execPath,
    [viteBin, ...process.argv.slice(2)],
    {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    },
  );

  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}
