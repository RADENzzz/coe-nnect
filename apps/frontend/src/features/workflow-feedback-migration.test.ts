import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL('../../../../' + path, import.meta.url), 'utf8');

const cases: Array<[string, RegExp[]]> = [
  [
    'apps/frontend/src/features/approvals/ApprovalsPage.tsx',
    [/useFeedback\(\)/, /feedback\.(success|error|failed)/, /extractApiError\(/],
  ],
  [
    'apps/frontend/src/features/approvals/components/RequestFormModal.tsx',
    [/useFeedback\(\)/, /feedback\.(success|error|failed)/, /extractApiError\(/],
  ],
  [
    'apps/frontend/src/features/dean/DeanApprovalsPage.tsx',
    [/useFeedback\(\)/, /feedback\.(success|error|failed)/, /extractApiError\(/],
  ],
  [
    'apps/frontend/src/features/dean/DeanDepartmentsManagePage.tsx',
    [/useFeedback\(\)/, /feedback\.(success|error|failed)/, /extractApiError\(/],
  ],
  [
    'apps/frontend/src/features/timetable/components/ScheduleDetailDrawer.tsx',
    [/useFeedback\(\)/, /feedback\.(success|error|failed)/, /extractApiError\(/],
  ],
  [
    'apps/frontend/src/features/timetable/components/MoveScheduleSheet.tsx',
    [/useFeedback\(\)/, /feedback\.(success|error|failed)/],
  ],
  [
    'apps/frontend/src/features/timetable/export/ExportToolbar.tsx',
    [/useFeedback\(\)/, /feedback\.(success|error|failed)/, /extractApiError\(/],
  ],
  [
    'apps/frontend/src/features/import/ProspectusPdfListPage.tsx',
    [/useFeedback\(\)/, /feedback\.(success|error|failed)/, /extractApiError\(/],
  ],
  [
    'apps/frontend/src/features/import/components/ImportProspectusDialog.tsx',
    [/useFeedback\(\)/, /feedback\.(success|error|failed)/, /extractApiError\(/],
  ],
  [
    'apps/frontend/src/features/import/components/AutoDetectDialog.tsx',
    [/useFeedback\(\)/, /feedback\.(success|error|failed)/, /extractApiError\(/],
  ],
  [
    'apps/frontend/src/features/import/ProspectusPdfEditorPage.tsx',
    [/useFeedback\(\)/, /feedback\.(success|error|failed)/, /extractApiError\(/],
  ],
  [
    'apps/frontend/src/features/plot-subject/PlotSubjectModal.tsx',
    [/useFeedback\(\)/, /feedback\.(success|error|failed)/, /extractApiError\(/],
  ],
];
for (const [path, patterns] of cases) {
  const source = read(path);
  for (const pattern of patterns) assert.match(source, pattern);
}

test('approval transient state is replaced by the global popup', () => {
  const page = read('apps/frontend/src/features/approvals/ApprovalsPage.tsx');
  assert.doesNotMatch(page, /const \[error, setError\]/);
  assert.doesNotMatch(page, /const \[success, setSuccess\]/);
  assert.doesNotMatch(
    read('apps/frontend/src/features/approvals/components/RequestFormModal.tsx'),
    /const \[formError, setFormError\]/,
  );
});

test('dean approval transient state is replaced by the global popup', () => {
  const page = read('apps/frontend/src/features/dean/DeanApprovalsPage.tsx');
  assert.doesNotMatch(page, /const \[actionError, setActionError\]/);
  assert.doesNotMatch(page, /const \[actionSuccess, setActionSuccess\]/);
  assert.doesNotMatch(page, /const \[decisionError, setDecisionError\]/);
  const departments = read(
    'apps/frontend/src/features/dean/DeanDepartmentsManagePage.tsx',
  );
  assert.doesNotMatch(departments, /const \[error, setError\]/);
  assert.doesNotMatch(departments, /const \[success, setSuccess\]/);
  assert.doesNotMatch(departments, /const \[verifyError, setVerifyError\]/);
});

test('timetable transient state is replaced by the global popup', () => {
  const drawer = read(
    'apps/frontend/src/features/timetable/components/ScheduleDetailDrawer.tsx',
  );
  assert.doesNotMatch(drawer, /const \[error, setError\]/);
  assert.doesNotMatch(drawer, /const \[remarksSaved, setRemarksSaved\]/);
  assert.doesNotMatch(
    read('apps/frontend/src/features/timetable/components/MoveScheduleSheet.tsx'),
    /const \[error, setError\]/,
  );
  assert.doesNotMatch(
    read('apps/frontend/src/features/timetable/export/ExportToolbar.tsx'),
    /const \[error, setError\]/,
  );
});

test('import field validation and terminal results remain local', () => {
  const dialog = read(
    'apps/frontend/src/features/import/components/ImportProspectusDialog.tsx',
  );
  assert.match(dialog, /const \[errors, setErrors\]/);
  assert.match(dialog, /const \[result, setResult\]/);
  assert.doesNotMatch(dialog, /const \[error, setError\]/);
  assert.doesNotMatch(
    read('apps/frontend/src/features/import/ProspectusPdfListPage.tsx'),
    /const \[error, setError\]/,
  );
  assert.doesNotMatch(
    read('apps/frontend/src/features/import/components/AutoDetectDialog.tsx'),
    /const \[error, setError\]/,
  );
  assert.doesNotMatch(
    read('apps/frontend/src/features/import/ProspectusPdfEditorPage.tsx'),
    /const \[tableError, setTableError\]/,
  );
});

test('native alerts are replaced by the global popup', () => {
  assert.doesNotMatch(
    read('apps/frontend/src/features/import/ProspectusPdfEditorPage.tsx'),
    /alert\(/,
  );
  assert.doesNotMatch(
    read('apps/frontend/src/features/plot-subject/PlotSubjectModal.tsx'),
    /alert\(/,
  );
});
