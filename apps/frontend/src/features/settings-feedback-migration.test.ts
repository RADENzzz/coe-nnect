import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL('../../../../' + path, import.meta.url), 'utf8');

const MIGRATED_FILES = [
  'apps/frontend/src/features/admin/AdminUsersPage.tsx',
  'apps/frontend/src/features/admin/components/DeleteUserModal.tsx',
  'apps/frontend/src/features/dev-tools/DevToolsPage.tsx',
  'apps/frontend/src/features/settings/components/SecuritySection.tsx',
  'apps/frontend/src/features/settings/components/RecoveryEmailSection.tsx',
  'apps/frontend/src/features/settings/components/AppearanceSettingsTab.tsx',
  'apps/frontend/src/features/settings/components/NotificationSettingsTab.tsx',
  'apps/frontend/src/features/faculty/components/PreferencesModal.tsx',
  'apps/frontend/src/features/faculty/components/UnavailabilityModal.tsx',
  'apps/frontend/src/features/faculty/components/QualificationsModal.tsx',
  'apps/frontend/src/features/subjects/components/RestrictionsPanel.tsx',
  'apps/frontend/src/features/rooms/components/RoomPreferencesModal.tsx',
  'apps/frontend/src/features/prospectus/components/ProspectusFormModal.tsx',
  'apps/frontend/src/features/auth/LoginPage.tsx',
  'apps/frontend/src/features/auth/ResetPasswordPage.tsx',
  'apps/frontend/src/features/auth/MaintenancePage.tsx',
  'apps/frontend/src/features/auth/DepartmentDeactivatedPage.tsx',
  'apps/frontend/src/features/landing/StudentPlannerPanel.tsx',
  'apps/frontend/src/features/reports/export/ApprovalsExportToolbar.tsx',
  'apps/frontend/src/features/system-config/SystemConfigPage.tsx',
  'apps/frontend/src/features/system-config/components/TermsPanel.tsx',
  'apps/frontend/src/features/system-config/components/SemesterTypesPanel.tsx',
  'apps/frontend/src/features/idp/IdpChangeRequestsPage.tsx',
];

const LOCAL_ERROR_HELPER =
  /(?:function|const)\s+(?:extractErrorMessage|apiErrorMessage|apiError|extractMessage|normalizeLoginError)\s*[=(]/;

for (const path of MIGRATED_FILES) {
  test(`${path} uses the global feedback popup`, () => {
    const source = read(path);
    assert.match(source, /useFeedback\(\)/);
    assert.match(source, /feedback\.(?:success|error|failed)/);
    assert.doesNotMatch(source, LOCAL_ERROR_HELPER);
  });
}

test('admin user form keeps field validation but drops its server-error banner', () => {
  const modal = read('apps/frontend/src/features/admin/components/UserFormModal.tsx');
  assert.match(modal, /const \[errors, setErrors\]/);
  assert.doesNotMatch(modal, /serverError/);
});

test('login keeps captcha error state but drops both transient error states', () => {
  const login = read('apps/frontend/src/features/auth/LoginPage.tsx');
  assert.match(login, /const \[capError, setCapError\]/);
  assert.doesNotMatch(login, /const \[error, setError\]/);
});

test('terminal password reset result remains local', () => {
  assert.match(
    read('apps/frontend/src/features/auth/ResetPasswordPage.tsx'),
    /const \[success, setSuccess\]/,
  );
});

test('recovery verification is outside the migration list and keeps its terminal state', () => {
  const verify = read('apps/frontend/src/features/auth/RecoveryVerifyPage.tsx');
  assert.match(verify, /const \[state, setState\]/);
  assert.ok(!MIGRATED_FILES.some((path) => path.includes('RecoveryVerifyPage')));
});

test('field-level validation stays in the named forms', () => {
  assert.match(
    read('apps/frontend/src/features/settings/components/RecoveryEmailSection.tsx'),
    /validationError/,
  );
  assert.match(
    read('apps/frontend/src/features/prospectus/components/ProspectusFormModal.tsx'),
    /const \[errors, setErrors\]/,
  );
});

test('all three motion switches remain in appearance settings', () => {
  const appearance = read(
    'apps/frontend/src/features/settings/components/AppearanceSettingsTab.tsx',
  );
  assert.match(appearance, /aria-label="Enable loading animations"/);
  assert.match(appearance, /aria-label="Enable text loading animations"/);
  assert.match(appearance, /aria-label="Enable the landing intro"/);
});

test('notification settings expose feedback sounds and previews', () => {
  const settings = read(
    'apps/frontend/src/features/settings/components/NotificationSettingsTab.tsx',
  );
  assert.match(settings, /Success\/error feedback sounds/);
  assert.match(settings, /checked=\{sound\.feedback\}/);
  assert.match(settings, /previewSound\('success'\)/);
  assert.match(settings, /previewSound\('error'\)/);
  assert.match(settings, /Notification, chat, and feedback sounds/i);
});

test('native alerts are gone from dev tools', () => {
  assert.doesNotMatch(
    read('apps/frontend/src/features/dev-tools/DevToolsPage.tsx'),
    /\balert\(/,
  );
});
