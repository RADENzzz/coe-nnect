import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

const page = read('apps/frontend/src/features/subjects/SubjectsPage.tsx');

test('subjects page exposes department-scoped edit requests', () => {
  assert.match(page, /searchParams\.get\('view'\)/);
  assert.match(page, /searchParams\.get\('reqStatus'\)/);
  assert.match(
    page,
    /queryKey: \['subject-edit-requests', \{ visible: true \}\]/,
  );
  assert.match(page, /fetchSubjectEditRequests\(\)/);
  assert.match(page, /staleTime: 0/);
  assert.match(page, /refetchOnWindowFocus: true/);
  assert.match(page, /pendingRequests\.length/);
  assert.match(page, /view === 'requests' \? requestRows : filtered/);
});

test('requests tab is gated by manage access and selects the requests view', () => {
  assert.match(page, /if \(canManage\) \{[\s\S]{0,160}label: 'Requests'/);
  assert.match(page, /setFilter\('view', 'requests'\)/);
});

test('request rows open the subject drawer on Edit access', () => {
  assert.match(
    page,
    /const handleOpenRequest = \(row: SubjectRequestRow\) => \{[\s\S]*?setFocusEditAccess\(true\);[\s\S]*?\};/,
  );
  assert.match(
    page,
    /onRowClick=\{\(row\) => handleOpenRequest\(row\)\}/,
  );
});

test('request notification deep link opens the matching subject drawer', () => {
  assert.match(page, /searchParams\.get\('request'\)/);
  assert.match(page, /hasConsumedRequestParam/);
  assert.match(page, /visibleRequests\.find/);
  assert.match(page, /next\.set\('view', 'requests'\)/);
  assert.match(page, /next\.delete\('request'\)/);
});
