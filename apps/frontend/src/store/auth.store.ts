import { create } from 'zustand';
import { User } from '@supabase/supabase-js';

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