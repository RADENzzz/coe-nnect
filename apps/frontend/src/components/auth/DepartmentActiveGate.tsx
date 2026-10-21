import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';

const WALL_PATH = '/department-deactivated';

/**
 * Redirects a Department Head to the wall page when their own
 * department is deactivated. Deans and Admins are never affected.
 *
 * Placement: inside AppShell, wrapping the `<Outlet />` for DH routes.
 * Can also be used standalone if DH routes are ever split.
 *
 * The gate is a pure render decision — no side effects. `profile.dept_active`
 * is refreshed by:
 *   - AuthProvider on SIGNED_IN
 *   - Wall page's "Refresh status" button
 *   - Manual page reload
 */
export default function DepartmentActiveGate() {
  const profile = useAuthStore((s) => s.profile);
  const location = useLocation();

  const isDH = profile?.role === 'department_head';
  const isWalled = isDH && profile?.dept_active === false;

  // Avoid an infinite redirect loop: if we're already ON the wall, let
  // the wall render itself.
  if (isWalled && location.pathname !== WALL_PATH) {
    return <Navigate to={WALL_PATH} replace />;
  }

  return <Outlet />;
}