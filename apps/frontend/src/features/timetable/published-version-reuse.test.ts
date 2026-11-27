import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

test('reuse summary, conflict workspace, and page handlers are wired', () => {
  const page = read('apps/frontend/src/features/timetable/TimetablePage.tsx');
  const workspace = read(
    'apps/frontend/src/features/timetable/components/PublishedReuseConflictWorkspace.tsx',
  );
  const summaryModal = read(
    'apps/frontend/src/features/timetable/components/ReuseSummaryModal.tsx',
  );

  // Required source contracts.
  assert.match(page, /preflightReuse/);
  assert.match(page, /applyReuse/);
  assert.match(page, /PublishedReuseConflictWorkspace/);
  assert.match(workspace, /PlotFocusMode|TimetableGrid/);
  assert.match(workspace, /readOnlyEntryIds/);
  assert.match(summaryModal, /matched/);
  assert.match(summaryModal, /skipped/);
  assert.match(summaryModal, /conflicts/);
  const reuseHandlers = page.slice(
    page.indexOf('handleReuse'),
    page.indexOf('return ('),
  );
  assert.doesNotMatch(
    workspace + summaryModal + reuseHandlers,
    /updateScheduleStatus|createPublishRequest/,
  );
  assert.doesNotMatch(
    page + workspace + summaryModal,
    /alert\(|confirm\(|prompt\(/,
  );
  assert.match(page, /useFeedback\(\)/);

  // Stronger wiring assertions consistent with the reuse brief.
  assert.match(page, /reuseVersion/);
  assert.match(page, /reusePreflight/);
  assert.match(page, /reuseConflicts/);
  assert.match(page, /ReuseSummaryModal/);
  assert.match(page, /handleApplyReuse/);
  assert.match(page, /onReuse={handleReuse}/);
  assert.match(page, /onConfirm={handleApplyReuse}/);
  assert.match(page, /conflicts={reuseConflicts}/);
  assert.match(page, /\['schedules', activeTerm\.termId\]/);
  assert.match(page, /\['published-versions', activeTerm\.semester/);
  assert.match(page, /setActiveVersion\(null\)/);

  // The real handler region (up to the page's JSX return) stays draft-only.
  const realHandlers = page.slice(
    page.indexOf('const handleReuse'),
    page.lastIndexOf('\n  return ('),
  );
  assert.doesNotMatch(
    realHandlers,
    /updateScheduleStatus|createPublishRequest|status\s*:/,
  );

  // Summary: all six counts, a zero-match summary path, and one apply action.
  assert.match(summaryModal, /ready/);
  assert.match(summaryModal, /keptAsIs/);
  assert.match(summaryModal, /warnings/);
  assert.match(summaryModal, /result\.failed/);
  assert.match(summaryModal, /Use matched subjects/);
  assert.match(summaryModal, /result\.summary/);
  assert.doesNotMatch(summaryModal, /updateSchedule|plotSubject|validatePlot/);

  // Workspace: exact prop surface, the shared drag contract, and validation
  // before either draft-write path.
  const propsStart = workspace.indexOf('interface Props');
  const propsBlock = workspace.slice(
    propsStart,
    workspace.indexOf('\n}', propsStart),
  );
  for (const prop of [
    'open',
    'onClose',
    'termId',
    'termLabel',
    'deptId',
    'deptName',
    'entries',
    'readOnlyEntryIds',
    'conflicts',
  ]) {
    assert.match(propsBlock, new RegExp(`\\b${prop}:`));
  }
  assert.match(workspace, /PLOT_DRAG_MIME/);
  assert.match(workspace, /ExternalPlotDragPayload/);
  assert.match(workspace, /onExternalDrop/);
  assert.match(workspace, /setData\(\s*PLOT_DRAG_MIME/);
  assert.match(workspace, /validatePlot\(/);
  assert.match(workspace, /updateSchedule\(/);
  assert.match(workspace, /plotSubject\(/);
  assert.match(workspace, /readOnlyEntryIds\.has/);
  assert.match(workspace, /status !== 'draft'/);
  assert.match(workspace, /useFeedback\(\)/);
  assert.match(workspace, /hardConflicts\.length/);
  assert.doesNotMatch(
    workspace,
    /status\s*:\s*['"](?:published|review|finalized)['"]/,
  );
});

test('reuse E2E registers the preflight waiter before clicking Reuse', () => {
  const spec = read('e2e/specs/published-version.spec.ts');
  const start = spec.indexOf('async function clickReuse(');
  assert.ok(start >= 0, 'clickReuse helper must exist');

  const end = spec.indexOf('\n}\n', start);
  assert.ok(end >= 0, 'clickReuse helper must be complete');
  const helper = spec.slice(start, end);

  const waiter = helper.indexOf('page.waitForResponse(');
  const click = helper.indexOf('.click();');
  assert.ok(waiter >= 0, 'clickReuse must wait for the preflight response');
  assert.ok(click >= 0, 'clickReuse must click the Reuse button');
  assert.ok(
    waiter < click,
    'waitForResponse must be registered before the Reuse click',
  );
});
