import { create } from 'zustand';
import { User } from '@supabase/supabase-js';

/**
 * Role type — kept in sync with the Postgres `user_role` enum.
 *
 * User-facing roles after the Admin→Dean consolidation:
 *   - college_dean     (top user-facing role; inherits all admin powers)
 *   - department_head  (scoped to one department)
 *
 * Internal roles (never shown in the UI, retained for dev/demo):
 *   - administrator    (hidden dev account, seed-only)
 *   - viewer           (legacy; no active users, retained for enum sync)
 *
 * Frontend routing only cares about the user-facing roles. The
 * `administrator` role redirects to the Dean portal (see
 * ProtectedRoute fallback logic).
 */
export type UserRole =
  | 'administrator'
  | 'college_dean'
  | 'department_head'
  | 'viewer';

export interface UserProfile {
  user_id: string;
  username: string;
  email: string;
  role: UserRole;
  dept_id: number | null;
  dept_code: string | null;
  dept_name: string | null;
  faculty_id: number | null;
  first_name: string;
}

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (isLoading: boolean) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setLoading: (isLoading) => set({ isLoading }),
  clearAuth: () => set({ user: null, profile: null }),
}));