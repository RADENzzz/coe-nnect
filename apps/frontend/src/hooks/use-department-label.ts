import { useAuthStore } from '../store/auth.store';

/**
 * Returns the logged-in user's department label + greeting name,
 * with sensible fallbacks so components never render blank strings.
 */
export function useDepartmentLabel() {
  const profile = useAuthStore((s) => s.profile);

  const deptName = profile?.dept_name ?? 'College of Engineering';
  const firstName = profile?.first_name ?? profile?.username ?? 'User';

  return { deptName, firstName, profile };
}