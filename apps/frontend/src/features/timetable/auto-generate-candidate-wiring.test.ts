import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

const page = read('apps/frontend/src/features/timetable/TimetablePage.tsx');
const utils = read(
  'apps/frontend/src/features/timetable/auto-schedule/auto-generate.utils.tsx',
);
const chooser = read(
  'apps/frontend/src/features/timetable/auto-schedule/AutoScheduleCandidateChooser.tsx',
);

function section(startMarker: string, endMarker: string): string {
  const start = page.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  const end = page.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return page.slice(start, end);
}

test('default generate snapshots live rows and skips pre-abandon', () => {
  assert.match(page, /const \[autoCandidates, setAutoCandidates\]/);
  assert.match(page, /const \[selectedCandidateId, setSelectedCandidateId\]/);
  assert.match(page, /const \[currentScheduleSnapshot, setCurrentScheduleSnapshot\]/);
  assert.match(page, /const \[generationToken, setGenerationToken\]/);
  assert.match(
    page,
    /const \[candidateCount, setCandidateCount\] = useState<2 \| 3 \| 5>\(3\)/,
  );

  const perform = section(
    'const performAutoGenerate = useCallback(',
    'const handleAutoGenerate = useCallback(',
  );
  assert.match(
    perform,
    /scopeAutoGenerateRows\(schedules \?\? \[\], myDeptId\)\.map\(toEntry\)/,
    'must snapshot scoped live rows',
  );
  assert.match(perform, /setCurrentScheduleSnapshot\(/, 'must keep the snapshot');
  assert.ok(
    perform.indexOf('scopeAutoGenerateRows') < perform.indexOf('autoGenerateSchedule('),
    'snapshot must happen before generation',
  );
  assert.doesNotMatch(
    perform,
    /abandonAutoGenerate\s*\(/,
    'candidate generation must not pre-abandon',
  );
  assert.match(perform, /candidateCount/, 'candidate count must be sent');

  assert.match(utils, /candidateCount: 2 \| 3 \| 5/);
  assert.match(utils, /onCandidateCountChange: \(count: 2 \| 3 \| 5\) => void/);
  assert.match(utils, /\[2, 3, 5\] as const/, 'exact count presets');
  assert.match(utils, /onCandidateCountChange\(count\)/);
  assert.match(utils, /disabled=\{isGenerating\}/, 'count selector disabled while generating');
});

test('candidate chooser is rendered instead of legacy preview in candidate mode', () => {
  assert.match(
    page,
    /import AutoScheduleCandidateChooser from '\.\/auto-schedule\/AutoScheduleCandidateChooser'/,
  );
  assert.match(page, /<AutoScheduleCandidateChooser/);
  assert.match(page, /candidates=\{autoCandidates\}/);
  assert.match(page, /currentEntries=\{currentScheduleSnapshot\}/);
  assert.match(page, /currentAutoDraftCount=\{autoDraftCount\}/);
  assert.match(page, /onUseCandidate=\{handleUseCandidate\}/);
  assert.match(page, /onClose=\{handleCloseCandidateChooser\}/);
  assert.match(
    page,
    /!autoCandidates && autoPreview && \(\s*<AutoSchedulePreview/,
    'legacy preview only when no candidate chooser is active',
  );
});

test('accept sends generationToken and selected candidate, then invalidates live queries', () => {
  const accept = section(
    'const handleUseCandidate = useCallback(',
    'const handleCloseCandidateChooser = useCallback(',
  );
  assert.match(
    accept,
    /confirmAutoGenerateCandidate\(\s*activeTerm\.termId,\s*myDeptId,\s*\{\s*generationToken,\s*candidate\s*\}\s*,?\s*\)/,
    'must send the original candidate as-is with the generation token',
  );
  assert.match(accept, /setAutoCandidates\(null\)/);
  assert.match(accept, /setGenerationToken\(null\)/);
  assert.match(accept, /invalidateAfterAutoGenerate\(activeTerm\.termId\)/);

  const invalidate = section(
    'const invalidateAfterAutoGenerate = useCallback(',
    'const handleAcceptPreview = useCallback(',
  );
  for (const key of [
    'schedules',
    'unscheduled',
    'unplotted-minors',
    'coverage',
    'faculty-requests',
    'flagged',
  ]) {
    assert.match(invalidate, new RegExp(`queryKey: \\['${key}'`), `invalidate ${key}`);
  }

  assert.match(page, /feedback\.error\(/, 'errors must use global feedback');
  assert.doesNotMatch(page, /\balert\(|\bconfirm\(|\bprompt\(/, 'no native dialogs');
});

test('keep current and discard make no confirm call and do not invalidate schedules', () => {
  const close = section(
    'const handleCloseCandidateChooser = useCallback(',
    'const handleAutoGenerate = useCallback(',
  );
  assert.match(close, /setAutoCandidates\(null\)/);
  assert.doesNotMatch(close, /confirmAutoGenerateCandidate/);
  assert.doesNotMatch(close, /invalidateQueries/);
  assert.doesNotMatch(close, /fetchSchedules/);
  assert.doesNotMatch(close, /discardAutoGenerate|abandonAutoGenerate/);

  assert.match(chooser, /onClick=\{onClose\}[\s\S]{0,800}>[\s\S]{0,40}Keep current/);
  assert.match(chooser, /onClick=\{onClose\}[\s\S]{0,800}>[\s\S]{0,40}Discard options/);
});

test('blocked minors and room deficits still short-circuit candidate generation', () => {
  const perform = section(
    'const performAutoGenerate = useCallback(',
    'const handleAutoGenerate = useCallback(',
  );
  assert.match(perform, /blockedByUnplottedMinors/);
  assert.match(perform, /roomDeficits/);
  assert.match(perform, /acknowledgeUnplottedMinors/);
  assert.match(perform, /setBlockedMinors\(/);

  const generation = read('apps/frontend/src/api/schedule.api.ts');
  assert.match(
    generation,
    /confirmAutoGenerateCandidate\(\s*termId: string,\s*deptId: string,\s*payload: \{ generationToken: string; candidate: AutoGenerateCandidate \}/,
    'confirm API must remain compatible with the chooser payload',
  );
});
