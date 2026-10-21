import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/auth.store';
import Icon from '../../components/ui/Icon';

/**
 * Shown to a Department Head whose own department has been deactivated
 * by the Dean. This page is the DH's ONLY reachable screen while walled.
 *
 * Two actions:
 *   - Refresh status — re-fetches the profile; if the Dean reactivated,
 *     we redirect back to /dashboard immediately.
 *   - Log out — standard sign-out.
 *
 * Design intent: no sidebar, no bell, no chat, no way back into the app
 * unless the dept is reactivated. The page IS the wall.
 */
export default function DepartmentDeactivatedPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const profile = useAuthStore((s) => s.profile);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRefresh = async () => {
    setError(null);
    setRefreshing(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate('/login', { replace: true });
        return;
      }

      const { data, error: qErr } = await supabase
        .from('users')
        .select(
          `user_id, username, email, role, dept_id, faculty_id,
           department:dept_id ( dept_code, dept_name, is_active ),
           faculty:faculty_id ( first_name )`,
        )
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (qErr || !data) {
        setError(
          'Could not verify your department status. Please try again, or log out and back in.',
        );
        return;
      }

      const dept = Array.isArray((data as any).department)
        ? (data as any).department[0]
        : (data as any).department;
      const fac = Array.isArray((data as any).faculty)
        ? (data as any).faculty[0]
        : (data as any).faculty;

      const role = data.role as any;
      let deptActive: boolean | null = null;
      if (role === 'college_dean' || role === 'administrator') {
        deptActive = true;
      } else if (dept) {
        deptActive = dept.is_active === true;
      }

      const newProfile = {
        user_id: data.user_id,
        username: data.username,
        email: data.email,
        role,
        dept_id: data.dept_id,
        dept_code: dept?.dept_code ?? null,
        dept_name: dept?.dept_name ?? null,
        dept_active: deptActive,
        faculty_id: data.faculty_id,
        first_name: fac?.first_name ?? data.username ?? 'User',
      };

      useAuthStore.getState().setProfile(newProfile);

      if (deptActive === true) {
        // Deactivated → active transition. Kick to dashboard and refresh
        // everything so cached data is clean.
        qc.invalidateQueries();
        navigate('/dashboard', { replace: true });
      } else {
        setError(
          'Still deactivated. Contact the College Dean to reactivate your department.',
        );
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to refresh status.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearAuth();
    navigate('/login', { replace: true });
  };

  const deptLabel =
    profile?.dept_code && profile?.dept_name
      ? `[${profile.dept_code}] ${profile.dept_name}`
      : 'your department';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-lg bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden">
        {/* Red accent bar */}
        <div className="h-1.5 bg-rose-600" />

        <div className="p-8 space-y-6">
          {/* Icon + heading */}
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 bg-rose-50 border border-rose-200 rounded-full flex items-center justify-center">
              <Icon
                name="block"
                filled
                size={32}
                className="text-rose-600"
              />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Department Deactivated
              </h1>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                The <strong>{deptLabel}</strong> department has been
                deactivated by the College Dean. You no longer have access to
                scheduling, faculty, or approvals until it&apos;s reactivated.
              </p>
            </div>
          </div>

          {/* What happened / data preserved */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              What you can do
            </p>
            <ul className="space-y-2 text-sm text-slate-700">
              <li className="flex items-start gap-2">
                <Icon
                  name="check_circle"
                  size={16}
                  className="text-emerald-600 shrink-0 mt-0.5"
                />
                <span>
                  <strong>Contact the College Dean</strong> to reactivate your
                  department.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Icon
                  name="check_circle"
                  size={16}
                  className="text-emerald-600 shrink-0 mt-0.5"
                />
                <span>
                  Your faculty, schedules, subjects, and history are{' '}
                  <strong>fully preserved</strong> and will return when the
                  department is reactivated.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Icon
                  name="check_circle"
                  size={16}
                  className="text-emerald-600 shrink-0 mt-0.5"
                />
                <span>
                  After reactivation, click <strong>Refresh status</strong>{' '}
                  below (or reload the page) to continue working.
                </span>
              </li>
            </ul>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
              <Icon name="error" size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {refreshing ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Checking…
                </>
              ) : (
                <>
                  <Icon name="refresh" size={16} />
                  Refresh status
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
            >
              <Icon name="logout" size={16} />
              Log out
            </button>
          </div>

          {/* Footer hint */}
          <p className="text-[11px] text-slate-400 text-center leading-relaxed pt-2 border-t border-slate-100">
            Signed in as <strong>{profile?.username}</strong> ({profile?.email})
          </p>
        </div>
      </div>
    </div>
  );
}