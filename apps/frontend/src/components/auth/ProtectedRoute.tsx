import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';

interface ProtectedRouteProps {
  allowedRoles?: string[];
  redirectTo?: string;
}

export default function ProtectedRoute({
  allowedRoles,
  redirectTo = '/login',
}: ProtectedRouteProps) {
  const { user, profile, isLoading } = useAuthStore();
  const location = useLocation();

  // 1. Still checking session — show spinner, do not redirect yet
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-low text-primary">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-on-surface-variant">Loading...</span>
        </div>
      </div>
    );
  }

  // 2. Not logged in — redirect to login
  if (!user) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // 3. Logged in but waiting for profile — show spinner
  if (allowedRoles && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-low text-primary">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // 4. Role check
  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    // Admins go to /admin, others to /dashboard
    const fallback = profile.role === 'administrator' ? '/admin' : '/dashboard';
    return <Navigate to={fallback} replace />;
  }

  // 5. All good
  return <Outlet />;
}