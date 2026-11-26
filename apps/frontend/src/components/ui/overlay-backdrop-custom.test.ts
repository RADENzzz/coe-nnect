import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const targets = [
  ['../../features/plot-subject/PlotSubjectModal.tsx', 0, 2],
  ['../../features/timetable/auto-schedule/SolverLiveBoard.tsx', 0, 1],
  ['../../features/timetable/components/StackPicker.tsx', 0, 1],
  ['../../features/help/components/GifCard.tsx', 0, 1],
  ['../../features/import/components/PdfCanvas.tsx', 0, 1],
  ['../../features/dashboard/components/UserDetailDrawer.tsx', 1, 1],
  ['../../features/faculty/components/FacultyDetailPanel.tsx', 0, 1],
  ['../../features/rooms/components/RoomDetailPanel.tsx', 0, 1],
  ['../../features/subjects/components/SubjectDetailPanel.tsx', 0, 1],
  ['../../features/prospectus/components/ProspectusDetailPanel.tsx', 0, 1],
  ['../../features/admin/components/UserDrawer.tsx', 0, 1],
] as const;

const marker = 'overlay-backdrop-blur-sm';

// Only full-viewport scrim lines: className begins with fixed/absolute inset-0
// and carries a translucent background tint. Decorative avatar/shimmer blurs
// are deliberately outside this selection.
const scrimLines = (source: string): string[] =>
  source
    .split(/\r?\n/)
    .filter(
      (line) =>
        /className=\{?["'`](?:fixed|absolute) inset-0\b/.test(line) &&
        /bg-(?:black|slate-900|white)\//.test(line),
    );

const literalBlur = /(?:^|[\s"'`])backdrop-blur-/;

test('custom overlay scrims defer blur to the glass theme', () => {
  for (const [relativePath, allowedDecorativeBlur, expectedScrims] of targets) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    const literalBlurCount =
      source.match(/["'\s]backdrop-blur-/g)?.length ?? 0;
    assert.equal(literalBlurCount, allowedDecorativeBlur);

    const scrims = scrimLines(source);
    assert.equal(scrims.length, expectedScrims, `${relativePath} scrim count`);
    for (const line of scrims) {
      assert.ok(line.includes(marker), `${relativePath}: ${marker} missing from scrim: ${line}`);
      assert.doesNotMatch(line, literalBlur);
    }
  }
});
