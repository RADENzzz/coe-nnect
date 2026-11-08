import type { UserRole } from './types';

export const ROLE_TONE: Record<string, 'danger' | 'warning' | 'info' | 'neutral'> = {
  administrator: 'danger',
  college_dean: 'warning',
  college_secretary: 'warning',
  department_head: 'info',
  viewer: 'neutral',
};

export const ROLE_LABELS: Record<UserRole | string, string> = {
  administrator: 'Administrator',
  college_dean: 'College Dean',
  college_secretary: 'College Secretary',
  department_head: 'Department Head',
  viewer: 'Viewer',
};

export const ASSIGNABLE_ROLES: { value: UserRole; label: string }[] = [
  { value: 'department_head', label: 'Department Head' },
  { value: 'college_secretary', label: 'College Secretary' },
  { value: 'college_dean', label: 'College Dean' },
];

export const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

export const PASSWORD_RULES = [
  { test: (p: string) => p.length >= 8, label: 'At least 8 characters' },
  { test: (p: string) => /[a-z]/.test(p), label: 'One lowercase letter' },
  { test: (p: string) => /[A-Z]/.test(p), label: 'One uppercase letter' },
  { test: (p: string) => /\d/.test(p), label: 'One number' },
  { test: (p: string) => /[@$!%*?&]/.test(p), label: 'One special character' },
];

export function passwordStrength(password: string) {
  const passed = PASSWORD_RULES.filter((r) => r.test(password)).length;
  const map = [
    { label: 'Very weak', barClass: 'bg-red-500', textClass: 'text-red-600' },
    { label: 'Weak', barClass: 'bg-orange-500', textClass: 'text-orange-600' },
    { label: 'Fair', barClass: 'bg-yellow-500', textClass: 'text-yellow-600' },
    { label: 'Good', barClass: 'bg-lime-500', textClass: 'text-lime-600' },
    { label: 'Strong', barClass: 'bg-green-600', textClass: 'text-green-700' },
  ];
  return { score: passed, ...map[Math.max(0, Math.min(passed, 5) - 1)] };
}

export const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';