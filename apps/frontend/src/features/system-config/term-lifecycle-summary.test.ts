import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL('../../../../../' + path, import.meta.url), 'utf8');

test('term lifecycle switches require a summary dialog before either mutation', () => {
  const source = read(
    'apps/frontend/src/features/system-config/components/TermsPanel.tsx',
  );

  // Contract checks from the task brief.
  assert.match(source, /fetchTermLifecycleSummary/);
  assert.match(source, /deactivation-summary|'deactivate'/);
  assert.match(source, /activation-summary|'activate'/);
  assert.match(source, /statusCounts\.draft/);
  assert.match(source, /pendingRequests/);
  assert.match(source, /useFeedback\(\)/);
  assert.doesNotMatch(source, /window\.alert|window\.confirm|window\.prompt/);

  // Both switches are gated on a fetched summary, not fired from the row button.
  assert.match(
    source,
    /summaryMutation\.mutate\(\{ term: t, action: 'deactivate' \}\)/,
  );
  assert.match(
    source,
    /summaryMutation\.mutate\(\{ term: t, action: 'activate' \}\)/,
  );
  assert.doesNotMatch(
    source,
    /onClick=\{\(\) => (deactivate|activate)Mutation\.mutate\(t\.termId\)\}/,
  );
  assert.match(source, /fetchTermLifecycleSummary\(input\.term\.termId, input\.action\)/);
  assert.match(source, /requireText="DEACTIVATE"/);
  assert.match(source, /setActivateTarget\(null\)/);
  assert.match(source, /feedback\.failed\(/);
  assert.doesNotMatch(source, /setLifecycleError|setSummaryError|setTermError/);

  // Activation warns with both sides of the switch: restored target counts and
  // the saved/cleared counts of the term currently active.
  const activationDialog = source.slice(
    source.indexOf('{/* Activate confirmation */}'),
    source.indexOf('{/* Deactivate confirmation */}'),
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
