import type { ComponentType } from 'react';

/**
 * Route chunk map.
 *
 * `App.tsx` builds its lazy pages from this map, and navigation surfaces
 * prefetch the same entries on hover/focus or during idle time. One map means
 * a prefetched chunk is always the chunk the route actually renders — the two
 * can never drift apart.
 */
export type RouteModule = { default: ComponentType<any> };
export type RouteLoader = () => Promise<RouteModule>;

export const ROUTE_LOADERS = {
  '/dashboard': () => import('../features/dashboard/DashboardPage'),
  '/timetable': () => import('../features/timetable/TimetablePage'),
  '/sections': () => import('../features/sections/SectionsPage'),
  '/approvals': () => import('../features/approvals/ApprovalsPage'),
  '/approvals/schedule-changes': () =>
    import('../features/approvals/ScheduleChangeApprovalsPage'),
  '/subjects': () => import('../features/subjects/SubjectsPage'),
  '/programs': () => import('../features/programs/ProgramsPage'),
  '/prospectus': () => import('../features/prospectus/ProspectusPage'),
  '/faculty': () => import('../features/faculty/FacultyPage'),
  '/rooms': () => import('../features/rooms/RoomsPage'),
  '/reports': () => import('../features/reports/ReportsHubPage'),
  '/reports/workload': () =>
    import('../features/reports/FacultyWorkloadPage'),
  '/reports/approvals': () =>
    import('../features/reports/ApprovalsReportPage'),
  '/reports/rooms': () => import('../features/reports/RoomSufficiencyPage'),
  '/import': () => import('../features/import/ProspectusPdfListPage'),
  '/import/:id': () => import('../features/import/ProspectusPdfEditorPage'),
  '/notifications': () =>
    import('../features/notifications/NotificationsInboxPage'),
  '/settings': () => import('../features/settings/SettingsPage'),
  '/help': () => import('../features/help/HelpPage'),

  '/dean/dashboard': () => import('../features/dean/DeanDashboardPage'),
  '/dean/departments': () => import('../features/dean/DeanDepartmentsPage'),
  '/dean/programs': () => import('../features/programs/ProgramsPage'),
  '/dean/departments/manage': () =>
    import('../features/dean/DeanDepartmentsManagePage'),
  '/dean/approvals': () => import('../features/dean/DeanApprovalsPage'),
  '/dean/requests': () => import('../features/approvals/ApprovalsPage'),
  '/dean/idp/change-requests': () =>
    import('../features/idp/IdpChangeRequestsPage'),
  '/dean/timetable': () => import('../features/timetable/TimetablePage'),
  '/dean/users': () => import('../features/admin/AdminUsersPage'),
  '/dean/faculty': () => import('../features/faculty/FacultyPage'),
  '/dean/subjects': () => import('../features/subjects/SubjectsPage'),
  '/dean/sections': () => import('../features/sections/SectionsPage'),
  '/dean/rooms': () => import('../features/rooms/RoomsPage'),
  '/dean/system-settings': () =>
    import('../features/system-config/SystemConfigPage'),
  '/dean/system-settings/terms': () =>
    import('../features/system-config/TermManagementPage'),
  '/dean/audit-trail': () => import('../features/audit-trail/AuditTrailPage'),
  '/dean/dev-tools': () => import('../features/dev-tools/DevToolsPage'),
  '/dean/reports': () => import('../features/reports/ReportsHubPage'),
  '/dean/reports/workload': () =>
    import('../features/reports/FacultyWorkloadPage'),
  '/dean/reports/approvals': () =>
    import('../features/reports/ApprovalsReportPage'),
  '/dean/reports/rooms': () =>
    import('../features/reports/RoomSufficiencyPage'),
  '/dean/import': () => import('../features/import/ProspectusPdfListPage'),
  '/dean/import/:id': () =>
    import('../features/import/ProspectusPdfEditorPage'),
  '/dean/notifications': () =>
    import('../features/notifications/NotificationsInboxPage'),
  '/dean/settings': () => import('../features/settings/SettingsPage'),
  '/dean/help': () => import('../features/help/HelpPage'),
} satisfies Record<string, RouteLoader>;

const started = new Set<string>();

function normalize(pathname: string): string {
  const path = pathname.split('?')[0].split('#')[0];
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path;
}

function loaderFor(path: string): RouteLoader | null {
  const exact = (ROUTE_LOADERS as Record<string, RouteLoader>)[path];
  if (exact) return exact;
  if (/^\/(?:dean\/)?import\/[^/]+$/.test(path)) {
    return ROUTE_LOADERS['/import/:id'];
  }
  return null;
}

/** Start loading one route chunk. Safe to call repeatedly. */
export function prefetchRoute(pathname: string): void {
  const path = normalize(pathname);
  if (started.has(path)) return;
  const loader = loaderFor(path);
  if (!loader) return;
  started.add(path);
  void loader().catch(() => {
    // A failed prefetch is harmless: the route will retry on navigation.
    started.delete(path);
  });
}

/**
 * Prefetch several routes once the browser is idle.
 *
 * Returns a cancel function so a shell that unmounts before the idle callback
 * fires does not keep loading chunks for a page the user has left.
 */
export function prefetchRoutes(paths: Iterable<string>): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const list = Array.from(paths);
  const run = () => list.forEach(prefetchRoute);

  type IdleWindow = Window & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout?: number },
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  const idleWindow = window as IdleWindow;

  if (typeof idleWindow.requestIdleCallback === 'function') {
    const handle = idleWindow.requestIdleCallback(run, { timeout: 2500 });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(run, 350);
  return () => window.clearTimeout(handle);
}
