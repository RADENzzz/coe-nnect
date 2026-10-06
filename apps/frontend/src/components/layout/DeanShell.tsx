import AppShell from './AppShell';

/**
 * DeanShell is now a thin wrapper around AppShell.
 * See AdminShell.tsx for rationale.
 */
export default function DeanShell() {
  return <AppShell />;
}