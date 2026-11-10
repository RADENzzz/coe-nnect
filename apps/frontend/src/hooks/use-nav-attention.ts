import { useMemo } from 'react';
import {
  filterNavByRole,
  type AttentionCategory,
  type NavItem,
  type RoleNav,
} from '../lib/constants/nav-config';
import type { Role } from '../lib/constants/roles';
import { useNotificationsList, useUnreadCount } from './use-notifications';

/**
 * Per-user "needs attention" state for the navigation rail.
 *
 * The signal is the user's own unread notifications — already scoped to them
 * server-side — bucketed by `category` and handed to whichever nav item
 * claims that category. No extra endpoint is involved, so the badge can never
 * disagree with the bell.
 *
 * `category → path` ownership is first-wins in config order: an item listing
 * a category twice, or two items listing the same one, still yields a single
 * badge.
 */

/** Newest N unread rows are enough to badge every page; the total comes
 *  from the dedicated count endpoint. */
const SAMPLE_LIMIT = 100;

export interface NavAttention {
  /** path → unread count. Only paths that claim a category appear. */
  counts: Record<string, number>;
  /** Total unread, including categories no nav item claims. */
  totalUnread: number;
  /** Page the newest unread notification points at, if any. */
  latestPath: string | null;
  /** Title of the newest unread notification, for the rail summary. */
  latestTitle: string | null;
  /** True while the first sample is in flight and nothing is cached. */
  isPending: boolean;
  /** Unread count for a specific nav item (0 when it claims nothing). */
  badgeFor: (item: NavItem) => number;
}

const EMPTY: NavAttention = {
  counts: {},
  totalUnread: 0,
  latestPath: null,
  latestTitle: null,
  isPending: false,
  badgeFor: () => 0,
};

export function useNavAttention(
  nav: RoleNav,
  role: Role | undefined,
): NavAttention {
  // The hidden administrator account has no notification surface in the UI;
  // do not poll on its behalf.
  const active = role !== 'administrator';

  const { data: total = 0, isPending: totalPending } = useUnreadCount(active);
  const { data: list, isPending: listPending } = useNotificationsList(
    { limit: SAMPLE_LIMIT },
    active,
  );

  return useMemo(() => {
    if (!active) return EMPTY;

    const visible = [
      ...filterNavByRole(nav.main, role),
      ...filterNavByRole(nav.footer, role),
    ];

    const ownerByCategory = new Map<AttentionCategory, string>();
    for (const item of visible) {
      if (!item.attention || item.attention === 'all') continue;
      for (const category of item.attention) {
        if (!ownerByCategory.has(category)) {
          ownerByCategory.set(category, item.path);
        }
      }
    }

    const unread = (list?.items ?? []).filter((item) => !item.isRead);
    const counts: Record<string, number> = {};
    let latestPath: string | null = null;
    let latestTitle: string | null = null;

    for (const item of unread) {
      const path = ownerByCategory.get(item.category as AttentionCategory);
      if (!path) continue;
      counts[path] = (counts[path] ?? 0) + 1;
      // The list arrives newest-first, so the first hit is the headline.
      if (latestPath === null) {
        latestPath = path;
        latestTitle = item.title;
      }
    }

    return {
      counts,
      totalUnread: total,
      latestPath,
      latestTitle,
      isPending: totalPending || listPending,
      badgeFor: (item: NavItem) =>
        item.attention === 'all'
          ? total
          : (counts[item.path] ?? 0),
    } satisfies NavAttention;
  }, [active, list?.items, nav.footer, nav.main, role, total, totalPending, listPending]);
}
