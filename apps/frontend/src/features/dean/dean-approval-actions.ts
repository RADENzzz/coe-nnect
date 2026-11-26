import type { RowAction } from '../../components/ui/RowActionMenu';

/**
 * Request rows use the same action plumbing as schedule rows, so the sticky
 * desktop actions cell and the mobile card menu both offer Review.
 */
export function reviewRowAction<T>(
  row: T,
  openDrawer: (row: T) => void,
): RowAction[] {
  return [
    {
      label: 'Review',
      icon: 'visibility',
      onClick: () => openDrawer(row),
    },
  ];
}

/**
 * Unfinalize bell links arrive as `?request=<id>&status=published`. Dropping
 * only `request` lets the status-follow effect move the Dean off the published
 * queue when the drawer closes, so the injected status goes with it. A plain
 * status filter (no request deep link) is untouched.
 */
export function clearRequestDeepLinkParams(
  searchParams: URLSearchParams,
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  if (!next.has('request')) return next;
  next.delete('request');
  next.delete('status');
  return next;
}
