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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-[#5c1219] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-500">Loading...</span>
        </div>
      </div>
    );
  }

  // 2. Not logged in — redirect to login
  if (!user) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // 3. Logged in but waiting for profile
  if (allowedRoles && !profile) {
    // If we've finished loading and STILL have no profile, we can't proceed.
    // Redirect to login (or an error route) instead of spinning forever.
    if (!isLoading) {
      return <Navigate to={redirectTo} state={{ from: location, error: 'Profile not found' }} replace />;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900">
        <div className="w-8 h-8 border-4 border-[#5c1219] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // 4. Role check
  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    // After the Admin→Dean consolidation, the dev account and the
    // Dean both route into /dean. DHs use /dashboard.
    let fallback = '/dashboard';
    if (profile.role === 'administrator') fallback = '/dean';
    if (profile.role === 'college_dean') fallback = '/dean';
    
    return <Navigate to={fallback} replace />;
  }

  // 5. All good
  return <Outlet />;
}