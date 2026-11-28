import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('logout overlay, waits, and dead state are removed', () => {
  const app = read('../App.tsx');
  const hook = read('./use-logout.ts');
  const store = read('../store/auth.store.ts');

  assert.doesNotMatch(app, /AnimatePresence/);
  assert.doesNotMatch(app, /motion\.div/);
  assert.doesNotMatch(app, /isLoggingOut/);
  assert.doesNotMatch(app, /Logging out/);
  assert.doesNotMatch(hook, /waitForMinimumLogoutAnimation/);
  assert.doesNotMatch(hook, /setLoggingOut/);
  assert.doesNotMatch(store, /isLoggingOut|setLoggingOut/);
  assert.equal(existsSync(new URL('./logout-flow.ts', import.meta.url)), false);
  assert.equal(existsSync(new URL('./logout-flow.test.ts', import.meta.url)), false);
});

test('logout still signs out with its safety timeout and cleanup', () => {
  const hook = read('./use-logout.ts');

  assert.match(hook, /heartbeatPresence\(1_500\)/);
  assert.match(hook, /queryClient\.clear\(\)/);
  assert.match(hook, /clearAuth\(\)/);
  assert.match(hook, /supabase\.auth\.signOut\(\{ scope: 'local' \}\)/);
  assert.match(hook, /window\.setTimeout\(resolve, 1_500\)/);
  assert.match(hook, /Promise\.race\(\[signOutPromise, signOutTimeout\]\)/);
  assert.match(hook, /navigate\('\/login', \{ replace: true \}\)/);
});

test('other logout surfaces and the animated icon are untouched', () => {
  assert.match(read('../features/auth/MaintenancePage.tsx'), /handleLogout/);
  assert.match(
    read('../features/auth/DepartmentDeactivatedPage.tsx'),
    /handleLogout/,
  );
  assert.match(
    read('../components/icons/animated/logout.tsx'),
    /const LogoutIcon/,
  );
});
