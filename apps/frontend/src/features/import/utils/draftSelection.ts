/** Issue shape returned by the auto-detect dialog's per-draft validator. */
export interface DraftIssue {
  kind: 'conflict' | 'invalid';
  message: string;
}

/**
 * Split selected drafts into those that can be created and those that must be
 * resolved first. Unselected drafts never participate in either list, so a
 * bad draft cannot be silently skipped when another draft is valid.
 */
export function partitionSelectedDrafts<T extends { selected: boolean }>(
  drafts: T[],
  issueFor: (draft: T) => DraftIssue | null,
): { ready: T[]; blocking: T[] } {
  const ready: T[] = [];
  const blocking: T[] = [];

  for (const draft of drafts) {
    if (!draft.selected) continue;
    if (issueFor(draft)) blocking.push(draft);
    else ready.push(draft);
  }

  return { ready, blocking };
}

/**
 * Refresh catalog-derived fields for untouched drafts while preserving drafts
 * the dean has edited. Matching is by `proposalId`, not array position.
 */
export function mergeCatalogSeededDrafts<T extends { proposalId: string }>(
  current: T[],
  fresh: T[],
  editedProposalIds: ReadonlySet<string>,
): T[] {
  const freshById = new Map(fresh.map((draft) => [draft.proposalId, draft]));

  return current.map((draft) =>
    editedProposalIds.has(draft.proposalId)
      ? draft
      : (freshById.get(draft.proposalId) ?? draft),
  );
}
