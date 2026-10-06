import AppShell from './AppShell';

/**
 * AdminShell is now a thin wrapper around AppShell.
 * AppShell reads the current role from auth.store and
 * picks the correct nav config from nav-config.ts.
 *
 * Kept as a separate component so the /admin/* route nest in App.tsx
 * still works and so we can add admin-specific chrome later if needed.
 */
export default function AdminShell() {
  return <AppShell />;
}