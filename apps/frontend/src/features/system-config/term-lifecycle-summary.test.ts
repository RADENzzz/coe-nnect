import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL('../../../../../' + path, import.meta.url), 'utf8');

test('term lifecycle switches require a summary dialog before either mutation', () => {
  const section = read(
    'apps/frontend/src/features/system-config/components/terms/TermManagementSection.tsx',
  );
  const shared = read(
    'apps/frontend/src/features/system-config/components/terms/term-shared.ts',
  );
  const panel = read(
    'apps/frontend/src/features/system-config/components/TermsPanel.tsx',
  );
  const config = read(
    'apps/frontend/src/features/system-config/SystemConfigPage.tsx',
  );

  // Contract checks from the task brief.
  assert.match(section, /fetchTermLifecycleSummary/);
  assert.match(section, /deactivation-summary|'deactivate'/);
  assert.match(section, /activation-summary|'activate'/);
  assert.match(section, /statusCounts\.draft/);
  assert.match(section, /pendingRequests/);
  assert.match(section, /useFeedback\(\)/);
  assert.doesNotMatch(section, /window\.alert|window\.confirm|window\.prompt/);

  assert.match(shared, /role === 'college_dean' \|\| role === 'college_secretary'/);
  assert.doesNotMatch(shared, /administrator/);
  assert.match(panel, /Open full page/);
  assert.match(panel, /mode="compact"/);
  assert.match(config, /canWriteTerms\(profile\)/);
  assert.match(config, /<SemesterTypesPanel/);
  assert.match(section, /Active/);
  assert.match(section, /Inactive/);
  assert.doesNotMatch(section, /Archived/);

  // Both switches are gated on a fetched summary, not fired from the row button.
  assert.match(
    section,
    /summaryMutation\.mutate\(\{ term: t, action: 'deactivate' \}\)/,
  );
  assert.match(
    section,
    /summaryMutation\.mutate\(\{ term: t, action: 'activate' \}\)/,
  );
  assert.doesNotMatch(
    section,
    /onClick=\{\(\) => (deactivate|activate)Mutation\.mutate\(t\.termId\)\}/,
  );
  assert.match(section, /fetchTermLifecycleSummary\(input\.term\.termId, input\.action\)/);
  assert.match(section, /requireText="DEACTIVATE"/);
  assert.match(section, /setActivateTarget\(null\)/);
  assert.match(section, /feedback\.failed\(/);
  assert.doesNotMatch(section, /setLifecycleError|setSummaryError|setTermError/);

  // Activation warns with both sides of the switch: restored target counts and
  // the saved/cleared counts of the term currently active.
  const activationDialog = section.slice(
    section.indexOf('{/* Activate confirmation */}'),
    section.indexOf('{/* Deactivate confirmation */}'),
  );
  assert.match(activationDialog, /Restored rows for/);
  assert.match(activationDialog, /activateSummary\.statusCounts\.draft/);
  assert.match(activationDialog, /activateSummary\.statusCounts\.review/);
  assert.match(activationDialog, /activateSummary\.statusCounts\.finalized/);
  assert.match(activationDialog, /activateSummary\.statusCounts\.published/);
  assert.match(
    activationDialog,
    /Saved and cleared from the currently active term/,
  );
  assert.match(activationDialog, /otherTerm\.statusCounts\.draft/);

  // The API exposes both preflight routes with the documented actions.
  const api = read('apps/frontend/src/api/terms.api.ts');
  assert.match(api, /action: 'deactivate' \| 'activate'/);
  assert.match(api, /deactivation-summary/);
  assert.match(api, /activation-summary/);
});
