import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL('../../../../' + path, import.meta.url), 'utf8');

const cases: Array<[string, RegExp[]]> = [
  [
    'apps/frontend/src/features/subjects/SubjectsPage.tsx',
    [/useFeedback\(\)/, /feedback\.(success|error|failed)/],
  ],
  [
    'apps/frontend/src/features/subjects/components/SubjectFormModal.tsx',
    [/useFeedback\(\)/],
  ],
  [
    'apps/frontend/src/features/programs/ProgramsPage.tsx',
    [/useFeedback\(\)/, /feedback\.(success|error)/],
  ],
  [
    'apps/frontend/src/features/rooms/RoomsPage.tsx',
    [/useFeedback\(\)/, /feedback\.(success|error)/],
  ],
  [
    'apps/frontend/src/features/sections/SectionsPage.tsx',
    [/useFeedback\(\)/, /feedback\.(success|error)/],
  ],
  [
    'apps/frontend/src/features/prospectus/ProspectusPage.tsx',
    [/useFeedback\(\)/, /feedback\.(success|error)/],
  ],
];
for (const [path, patterns] of cases) {
  const source = read(path);
  for (const pattern of patterns) assert.match(source, pattern);
}

assert.doesNotMatch(
  read('apps/frontend/src/features/subjects/SubjectsPage.tsx'),
  /const \[alert, setAlert\]/,
);
assert.doesNotMatch(
  read('apps/frontend/src/features/programs/ProgramsPage.tsx'),
  /const \[success, setSuccess\]/,
);
assert.doesNotMatch(
  read('apps/frontend/src/features/rooms/RoomsPage.tsx'),
  /const \[success, setSuccess\]/,
);
assert.doesNotMatch(
  read('apps/frontend/src/features/sections/SectionsPage.tsx'),
  /const \[success, setSuccess\]/,
);
assert.match(
  read('apps/frontend/src/features/sections/SectionsPage.tsx'),
  /const \[errors, setErrors\]/,
);
assert.doesNotMatch(
  read('apps/frontend/src/features/prospectus/ProspectusPage.tsx'),
  /const \[success, setSuccess\]/,
);
assert.doesNotMatch(
  read('apps/frontend/src/features/subjects/components/SubjectFormModal.tsx'),
  /const \[formError, setFormError\]/,
);

test('room delete success is emitted after the mutation resolves, not optimistically', () => {
  const roomsPage = read('apps/frontend/src/features/rooms/RoomsPage.tsx');
  const deleteMutation = roomsPage.slice(
    roomsPage.indexOf('const deleteMutation = useMutation({'),
    roomsPage.indexOf('const openCreate = () => {'),
  );
  const onMutateBody = deleteMutation.slice(
    deleteMutation.indexOf('onMutate:'),
    deleteMutation.indexOf('onError:'),
  );
  const onSuccessBody = deleteMutation.slice(
    deleteMutation.indexOf('onSuccess:'),
  );

  // A failed delete must never have already pushed a success popup.
  assert.doesNotMatch(
    onMutateBody,
    /feedback\.success\('Room deleted\.'\)/,
  );
  assert.match(onSuccessBody, /feedback\.success\('Room deleted\.'\)/);
});
