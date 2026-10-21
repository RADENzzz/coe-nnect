import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Load local E2E overrides before Playwright reads the environment.
 *
 * `e2e/.env.local` is gitignored. CI supplies the same values as job-level
 * environment variables, so no file is required there.
 */
export function loadE2eEnv(): void {
  const file = resolve(process.cwd(), 'e2e', '.env.local');
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

export function optionalEnv(name: string, fallback = ''): string {
  const value = process.env[name];
  return value == null || value.trim() === '' ? fallback : value;
}

export function requireEnv(name: string): string {
  const value = optionalEnv(name);
  if (!value) {
    throw new Error(
      `${name} is required for Playwright E2E tests. ` +
        'Copy e2e/.env.example to e2e/.env.local and fill in the test project values.',
    );
  }
  return value;
}
