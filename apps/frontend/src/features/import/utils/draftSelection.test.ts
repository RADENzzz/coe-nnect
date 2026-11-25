import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mergeCatalogSeededDrafts,
  partitionSelectedDrafts,
  type DraftIssue,
} from './draftSelection.ts';

test('a selected draft with an issue blocks creation even when another draft is ready', () => {
  const drafts = [
    { proposalId: 'valid', selected: true },
    { proposalId: 'unrecognized', selected: true },
    { proposalId: 'unselected', selected: false },
  ];
  const issues: Record<string, DraftIssue> = {
    unrecognized: {
      kind: 'invalid',
      message: 'Not recognized: 3RD SEMESTER',
    },
    unselected: { kind: 'invalid', message: 'ignored while unselected' },
  };

  const { ready, blocking } = partitionSelectedDrafts(
    drafts,
    (draft) => issues[draft.proposalId] ?? null,
  );

  assert.deepEqual(
    ready.map((draft) => draft.proposalId),
    ['valid'],
  );
  assert.deepEqual(
    blocking.map((draft) => draft.proposalId),
    ['unrecognized'],
  );
  assert.equal(blocking.length > 0, true);
});

test('catalog merge keeps edited drafts and refreshes untouched drafts by proposal id', () => {
  interface DraftRow {
    proposalId: string;
    semester: string | null;
    label: string;
  }

  const current: DraftRow[] = [
    { proposalId: 'edited', semester: null, label: 'dean edit' },
    { proposalId: 'untouched', semester: null, label: 'old seed' },
  ];
  const fresh: DraftRow[] = [
    { proposalId: 'edited', semester: '3rd', label: 'fresh seed' },
    { proposalId: 'untouched', semester: 'summer', label: 'fresh seed' },
  ];

  const merged = mergeCatalogSeededDrafts(
    current,
    fresh,
    new Set(['edited']),
  );

  assert.deepEqual(merged, [
    { proposalId: 'edited', semester: null, label: 'dean edit' },
    { proposalId: 'untouched', semester: 'summer', label: 'fresh seed' },
  ]);
});
