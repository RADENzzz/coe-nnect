import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

test('subject form transfers ownership when a MINOR is unlabeled', () => {
  const modal = read(
    'apps/frontend/src/features/subjects/components/SubjectFormModal.tsx',
  );

  // Effective department drives validation, dirty state and the submitted payload.
  const effective = modal.slice(
    modal.indexOf('const effectiveDeptId'),
    modal.indexOf('const effectiveDeptId') + 260,
  );
  assert.match(effective, /subject\?\.isMinor && !form\.isMinor/);
  assert.match(effective, /myDeptId \|\| form\.deptId/);

  const payload = modal.slice(
    modal.indexOf('const payload: CreateSubjectInput'),
    modal.indexOf("if (mode === 'create')"),
  );
  assert.match(payload, /subject\.isMinor && !form\.isMinor/);
  assert.match(payload, /myDeptId/);
  assert.match(payload, /deptId: effectiveDeptId/);

  assert.match(modal, /String\(s\.deptId\) === effectiveDeptId/);
  assert.match(modal, /effectiveDeptId !== \(subject\.deptId \?\? ''\)/);
  assert.match(modal, /Locked to owning department/);
});

test('locked MINOR department agrees with the owner submitted on unlabel', () => {
  const modal = read(
    'apps/frontend/src/features/subjects/components/SubjectFormModal.tsx',
  );
  const start = modal.indexOf('const lockedMinorOwner');
  assert.ok(start > 0, 'foreign MINOR lock must exist');
  const lock = modal.slice(start, modal.indexOf('// ── Per-step validation'));

  // Read-only only for an actor with a different department; the original
  // subject must still be a MINOR owned by someone else.
  assert.match(lock, /mode === 'edit'/);
  assert.match(lock, /!!subject\?\.isMinor/);
  assert.match(lock, /!!myDeptId/);
  assert.match(lock, /String\(subject\.deptId \?\? ''\) !== myDeptId/);

  // Still MINOR: the current owner. Unlabeled: the department that will
  // receive ownership, i.e. the same effectiveDeptId sent as payload.deptId.
  assert.match(lock, /const unlabelTransfer = lockedMinorOwner && !form\.isMinor/);
  assert.match(
    lock,
    /const lockedDeptId = unlabelTransfer\s*\? effectiveDeptId\s*: String\(subject\?\.deptId \?\? ''\)/,
  );
  assert.match(
    lock,
    /\[\$\{(lockedDepartment|department)\.deptCode\}\] \$\{(lockedDepartment|department)\.deptName\}/,
  );
  assert.match(lock, /lockedDeptId \|\| '—'/);
  assert.ok(
    lock.includes(
      "'Locked to owning department. Unlabel the MINOR to transfer it to your department.'",
    ),
  );
  assert.ok(
    lock.includes("'Ownership will transfer to your department on save.'"),
  );
  assert.match(lock, /unlabelTransfer\s*\? 'Ownership will transfer/);

  // Both the hint and the rendered text use the live state, and remain
  // read-only (no select) while locked.
  const field = modal.slice(
    modal.indexOf('label="Department"'),
    modal.indexOf('</FormField>', modal.indexOf('label="Department"')),
  );
  assert.match(field, /hint=\{\s*lockedMinorOwner\s*\? lockedOwnerHint/);
  assert.match(field, /\{lockedOwnerLabel\}/);
  assert.doesNotMatch(field, /<select[\s\S]*\{lockedOwnerLabel\}/);
});

test('deep link opens the detail drawer focused on Edit access without an error toast', () => {
  const page = read('apps/frontend/src/features/subjects/SubjectsPage.tsx');
  const panel = read(
    'apps/frontend/src/features/subjects/components/SubjectDetailPanel.tsx',
  );

  const start = page.indexOf('if (isForeign(target)) {');
  assert.ok(start > 0, 'deep-link foreign branch must exist');
  const deepLink = page.slice(start, start + 500);
  assert.match(deepLink, /setDetailEntry\(target\)/);
  assert.match(deepLink, /setFocusEditAccess\(true\)/);
  assert.doesNotMatch(deepLink, /feedback\.error\(/);
  assert.ok(page.includes('focusEditAccess={focusEditAccess}'));

  // The panel consumes the hint by switching to Details and scrolling to the
  // Edit access section; ordinary drawer opens do not pass the hint.
  assert.match(panel, /focusEditAccess\?: boolean/);
  assert.match(
    panel,
    /<InfoSection title="Edit access" icon="key" sectionRef=\{editAccessRef\}>/,
  );
  const focusEffect = panel.slice(
    panel.indexOf('// Focus Edit access when requested'),
    panel.indexOf('// Escape closes'),
  );
  assert.match(focusEffect, /setTab\('details'\)/);
  assert.match(focusEffect, /requestAnimationFrame/);
  assert.match(focusEffect, /scrollIntoView/);
});
