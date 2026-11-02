import { Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchSystemStatus } from '../../api/system-status.api';
import { useAuthStore } from '../../store/auth.store';
import {
  isMaintenancePreviewEnabled,
  isLocalMaintenanceBypassEnabled,
} from '../../lib/maintenance-preview';

/** These routes must stay reachable so the dev can sign in / sign out. */
const PUBLIC_DURING_MAINTENANCE = new Set(['/login', '/maintenance']);

/**
 * App-wide maintenance gate.
 *
 * When the developer enables maintenance mode, every route except the
 * login and maintenance screens redirects to the maintenance page. The
 * hidden `administrator` account bypasses the gate (both here and in the
 * backend JwtAuthGuard) so it can turn the gate back off.
 *
 * Locally, `isLocalMaintenanceBypassEnabled()` can ignore the maintenance
 * flag so all roles keep working, while `isMaintenancePreviewEnabled()` still
 * lets the dev see the wall exactly as a normal user would.
 */
export default function MaintenanceGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const location = useLocation();
  const profile = useAuthStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);
  const isLoadingAuth = useAuthStore((s) => s.isLoading);

  const { data } = useQuery({
    queryKey: ['system-status'],
    queryFn: fetchSystemStatus,
    retry: false,
    staleTime: 0,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const previewAsUser = isMaintenancePreviewEnabled();
  const maintenance =
    (data?.maintenanceMode === true && !isLocalMaintenanceBypassEnabled()) ||
    previewAsUser;
  const isRealDev =
    profile?.role === 'administrator' ||
    user?.app_metadata?.role === 'administrator';
  const isDev = !previewAsUser && isRealDev;

  // Preview mode simulates a normal user, but the real dev must still be
  // able to reach Dev Tools to switch the preview off again.
  const canExitPreview =
    isRealDev && location.pathname.startsWith('/dean/dev-tools');

  // Wait for AuthProvider to resolve the session before redirecting, so the
  // dev account does not bounce through /maintenance immediately after login.
  if (
    maintenance &&
    !isDev &&
    !canExitPreview &&
    !isLoadingAuth &&
    !PUBLIC_DURING_MAINTENANCE.has(location.pathname)
  ) {
    return <Navigate to="/maintenance" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
