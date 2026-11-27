import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../../../../../../${path}`, import.meta.url), 'utf8');

test('candidate API sends candidateCount and posts selected candidate', () => {
  const api = read('apps/frontend/src/api/schedule.api.ts');

  assert.match(api, /candidateCount/, 'autoGenerateSchedule must accept candidateCount');
  assert.match(
    api,
    /confirmAutoGenerateCandidate/,
    'confirmAutoGenerateCandidate must exist',
  );
  assert.match(
    api,
    /\/v1\/schedules\/auto-generate\/confirm/,
    'confirm endpoint must be posted to',
  );
  assert.match(api, /generationToken/, 'confirm payload must include generationToken');
  assert.match(api, /candidate/, 'confirm payload must include candidate');
});

test('chooser renders Current plus every generated thumbnail read only', () => {
  const chooser = read(
    'apps/frontend/src/features/timetable/auto-schedule/AutoScheduleCandidateChooser.tsx',
  );

  assert.match(chooser, /currentEntries/, 'chooser must render current entries');
  assert.match(chooser, /candidates\.map/, 'chooser must render every candidate');
  assert.match(chooser, /TimetableGrid/, 'chooser must use TimetableGrid');
  assert.match(chooser, /readOnlyEntryIds/, 'thumbnails must be read-only');
  assert.match(chooser, /busy/, 'thumbnails must be busy/locked');
  assert.doesNotMatch(chooser, /onEntryClick/, 'chooser must not handle entry clicks');
  assert.doesNotMatch(chooser, /onEntryMove/, 'chooser must not handle entry moves');
  assert.match(chooser, /ConfirmDialog/, 'chooser must use ConfirmDialog');
  assert.match(chooser, /createPortal/, 'chooser must render in a portal');
});

test('chooser opens a confirm dialog before using a candidate', () => {
  const chooser = read(
    'apps/frontend/src/features/timetable/auto-schedule/AutoScheduleCandidateChooser.tsx',
  );

  assert.match(chooser, /ConfirmDialog/, 'chooser must render ConfirmDialog');
  assert.match(
    chooser,
    /Replace existing auto-generated drafts\?/,
    'confirm dialog must use the required title',
  );
  assert.match(chooser, /onUseCandidate/, 'confirm must gate onUseCandidate');
  assert.match(chooser, /currentAutoDraftCount/, 'confirm must name draft count');
});

test('chooser emits no native dialogs or local toast state', () => {
  const chooser = read(
    'apps/frontend/src/features/timetable/auto-schedule/AutoScheduleCandidateChooser.tsx',
  );

  assert.doesNotMatch(chooser, /alert\(/, 'no native alert');
  assert.doesNotMatch(chooser, /confirm\(/, 'no native confirm');
  assert.doesNotMatch(chooser, /prompt\(/, 'no native prompt');
  assert.doesNotMatch(chooser, /useState[^\n]*success/i, 'no local success state');
  assert.doesNotMatch(chooser, /useState[^\n]*failure/i, 'no local failure state');
  assert.doesNotMatch(chooser, /Toast/, 'no local toast');
});

test('candidate schedule uses raw solver blocks and chooser maps them for preview', () => {
  const api = read('apps/frontend/src/api/schedule.api.ts');
  const chooser = read(
    'apps/frontend/src/features/timetable/auto-schedule/AutoScheduleCandidateChooser.tsx',
  );

  assert.match(api, /AutoGenerateCandidateBlock/, 'raw candidate block type must exist');
  assert.doesNotMatch(
    api,
    /schedule:\s*ScheduleEntry\[\]/,
    'candidate schedule must not be typed as ScheduleEntry[]',
  );
  assert.match(api, /schedule:\s*AutoGenerateCandidateBlock\[\]/, 'candidate schedule must use raw block type');
  assert.match(chooser, /DAY_MAP/, 'chooser must map raw day names through DAY_MAP');
  assert.match(chooser, /TimetableGrid/, 'chooser still renders TimetableGrid');
});
