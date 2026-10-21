import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

import { loadE2eEnv, optionalEnv } from './env';

loadE2eEnv();

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

const baseURL = withoutTrailingSlash(
  optionalEnv('E2E_BASE_URL', 'http://127.0.0.1:5174'),
);
const apiURL = withoutTrailingSlash(
  optionalEnv('E2E_API_URL', 'http://127.0.0.1:3100/api'),
);
const supabaseURL = withoutTrailingSlash(
  optionalEnv('E2E_SUPABASE_URL', 'http://127.0.0.1:54321'),
);
const anonKey = optionalEnv('E2E_SUPABASE_ANON_KEY');
const serviceRoleKey = optionalEnv('E2E_SUPABASE_SERVICE_ROLE_KEY');
const databaseURL = optionalEnv(
  'E2E_DATABASE_URL',
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
);
const skipWebServer = optionalEnv('E2E_SKIP_WEBSERVER') === '1';
const resultsDir = resolve(process.cwd(), 'e2e', 'test-results');
const reportDir = resolve(process.cwd(), 'e2e', 'playwright-report');

const api = new URL(apiURL);
const apiPort = api.port || '3100';
const apiPrefix = api.pathname.replace(/^\/+|\/+$/g, '') || 'api';
const frontend = new URL(baseURL);
const frontendPort = frontend.port || '5174';
const isLocalDatabase = /(^|[@/])(localhost|127\.0\.0\.1|\[::1\])(?=[:/]|$)/i.test(
  databaseURL,
);
const databaseSSL = optionalEnv(
  'E2E_DATABASE_SSL',
  isLocalDatabase ? 'false' : 'true',
);

const inheritedEnv: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined) inheritedEnv[key] = value;
}

/**
 * The same environment is handed to both dev servers. Vite only exposes
 * VITE_* values, while Nest reads the DATABASE/SUPABASE values. Explicit
 * values override any leftover production settings in local .env files.
 */
const webServerEnv: Record<string, string> = {
  ...inheritedEnv,
  NODE_ENV: 'test',
  PORT: apiPort,
  API_PREFIX: apiPrefix,
  DATABASE_URL: databaseURL,
  DATABASE_SSL: databaseSSL,
  SUPABASE_URL: supabaseURL,
  SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  FRONTEND_URL: baseURL,
  VITE_API_BASE_URL: apiURL,
  VITE_SUPABASE_URL: supabaseURL,
  VITE_SUPABASE_ANON_KEY: anonKey,
  // Never surface the production demo shortcuts in E2E runs.
  VITE_DEV_ADMIN_EMAIL: '',
  VITE_DEV_ADMIN_PASSWORD: '',
  VITE_DEV_HEAD_EMAIL: '',
  VITE_DEV_HEAD_PASSWORD: '',
};

export default defineConfig({
  testDir: './specs',
  globalSetup: './global-setup.ts',
  outputDir: resultsDir,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  // Keep the runner below the workflow step timeout so a stuck browser or
  // worker produces a real failure and an uploaded report instead of a silent
  // GitHub Actions cancellation.
  globalTimeout: 12 * 60_000,
  maxFailures: 1,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  reporter: process.env.CI
    ? [
        ['line'],
        ['github'],
        ['html', { open: 'never', outputFolder: reportDir }],
      ]
    : [
        ['list'],
        ['html', { open: 'never', outputFolder: reportDir }],
      ],
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    timezoneId: 'Asia/Manila',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'off' : 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    launchOptions: {
      args: ['--disable-dev-shm-usage'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
  ],
  // Playwright's default SIGKILL can leave Vite/esbuild holding the webServer
  // stdio pipes on Linux, so the run never exits or prints its summary. SIGTERM
  // lets the dev servers close their children before Playwright tears down.
  webServer: skipWebServer
    ? undefined
    : [
        {
          command:
            'pnpm --filter @coe-nnect/backend build && ' +
            'pnpm --filter @coe-nnect/backend start:prod',
          url: `${apiURL}/docs`,
          timeout: 240_000,
          reuseExistingServer: false,
          gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
          env: webServerEnv,
        },
        {
          command:
            'pnpm --filter @coe-nnect/frontend exec vite ' +
            `--host 127.0.0.1 --port ${frontendPort} --strictPort`,
          url: baseURL,
          timeout: 120_000,
          reuseExistingServer: false,
          gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
          env: webServerEnv,
        },
      ],
});
