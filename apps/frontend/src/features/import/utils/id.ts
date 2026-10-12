/**
 * Small, non-cryptographic ID generator for row IDs.
 * Rows only need uniqueness within a table for the session —
 * the backend doesn't care about the format.
 */
export function makeRowId(): string {
  return `r_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}