import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import FormField from './FormField';
import PasswordStrength from './PasswordStrength';
import { ASSIGNABLE_ROLES, PASSWORD_REGEX } from './constants';
import type { UserRecord, UserRole, DeptLite, FacultyLite } from './types';

type Mode = 'create' | 'edit';

const INPUT_CLS =
  'w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary';

interface FormState {
  email: string;
  password: string;
  username: string;
  role: UserRole;
  deptId: string;
  facultyId: string;
}

const EMPTY: FormState = {
  email: '',
  password: '',
  username: '',
  role: 'department_head',
  deptId: '',
  facultyId: '',
};

interface Props {
  open: boolean;
  mode: Mode;
  editing: UserRecord | null;
  onClose: () => void;
  departments: DeptLite[];
  faculty: FacultyLite[];
  users: UserRecord[];
  submitting: boolean;
  serverError: string | null;
  onCreate: (input: {
    email: string;
    password: string;
    username: string;
    role: UserRole;
    deptId?: string;
    facultyId?: string;
  }) => void;
  onUpdate: (id: string, input: Record<string, unknown>) => void;
}

export default function UserFormModal({
  open,
  mode,
  editing,
  onClose,
  departments,
  faculty,
  users,
  submitting,
  serverError,
  onCreate,
  onUpdate,
}: Props) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset whenever opened or target changes.
  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && editing) {
      setForm({
        email: editing.email,
        password: '',
        username: editing.username,
        role: editing.role,
        deptId: editing.deptId ?? '',
        facultyId: editing.facultyId ?? '',
      });
    } else {
      setForm(EMPTY);
    }
    setErrors({});
  }, [open, mode, editing?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-suggest faculty by email (create mode).
  useEffect(() => {
    if (mode !== 'create' || !form.email || form.facultyId) return;
    const typed = form.email.trim().toLowerCase();
    if (!typed) return;
    const match = faculty.find(
      (f) =>
        f.isActive &&
        f.email &&
        f.email.trim().toLowerCase() === typed &&
        (!form.deptId || String(f.deptId ?? '') === String(form.deptId)),
    );
    if (match) setForm((p) => ({ ...p, facultyId: String(match.facultyId) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.email, faculty, mode, form.deptId]);

  const facultyById = useMemo(() => {
    const m = new Map<string, FacultyLite>();
    for (const f of faculty) m.set(String(f.facultyId), f);
    return m;
  }, [faculty]);

  const eligibleFaculty = useMemo(() => {
    if (!form.deptId) return faculty.filter((f) => f.isActive);
    return faculty.filter(
      (f) => f.isActive && String(f.deptId ?? '') === String(form.deptId),
    );
  }, [faculty, form.deptId]);

  const emailMatch = useMemo(() => {
    if (!form.email) return null;
    const typed = form.email.trim().toLowerCase();
    return eligibleFaculty.find((f) => f.email && f.email.trim().toLowerCase() === typed) ?? null;
  }, [eligibleFaculty, form.email]);

  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'deptId' && prev.facultyId) {
        const fac = facultyById.get(prev.facultyId);
        if (fac && value && String(fac.deptId ?? '') !== String(value)) {
          next.facultyId = '';
        }
      }
      return next;
    });
    if (errors[name]) {
      setErrors((p) => {
        const n = { ...p };
        delete n[name];
        return n;
      });
    }
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.username.trim()) e.username = 'Username is required.';

    if (mode === 'create') {
      if (!form.email.trim()) e.email = 'Email is required.';
      else if (users.some((u) => u.email === form.email)) e.email = 'This email is already in use.';
      if (users.some((u) => u.username === form.username)) e.username = 'This username is already taken.';
      if (!PASSWORD_REGEX.test(form.password)) e.password = 'Password does not meet the requirements below.';
    }

    if (form.role === 'department_head' && !form.deptId) {
      e.deptId = 'Department Heads must be assigned to a department.';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;

    if (mode === 'create') {
      onCreate({
        email: form.email,
        password: form.password,
        username: form.username,
        role: form.role,
        deptId: form.deptId || undefined,
        facultyId: form.facultyId || undefined,
      });
    } else if (mode === 'edit' && editing) {
      const payload: Record<string, unknown> = {};
      if (form.username !== editing.username) payload.username = form.username;
      if (form.role !== editing.role) payload.role = form.role;
      if ((form.deptId || null) !== editing.deptId) payload.deptId = form.deptId || null;
      if ((form.facultyId || null) !== editing.facultyId) payload.facultyId = form.facultyId || null;

      if (Object.keys(payload).length === 0) {
        setErrors({ _: 'No changes to save.' });
        return;
      }
      onUpdate(editing.userId, payload);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Create User' : `Edit — ${editing?.username ?? ''}`}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        {serverError && (
          <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
            <Icon name="error" size={14} className="shrink-0 mt-0.5" />
            <span>{serverError}</span>
          </div>
        )}
        {errors._ && (
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            {errors._}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {mode === 'create' ? (
            <>
              <FormField label="Email" required error={errors.email}>
                <input
                  type="email"
                  name="email"
                  required
                  value={form.email}
                  onChange={onChange}
                  placeholder="head@wmsu.edu.ph"
                  className={INPUT_CLS}
                />
              </FormField>

              <FormField label="Password" required error={errors.password}>
                <input
                  type="password"
                  name="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={onChange}
                  placeholder="Must be strong"
                  className={INPUT_CLS}
                />
                <PasswordStrength password={form.password} />
              </FormField>
            </>
          ) : (
            editing && (
              <div className="md:col-span-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-start gap-2">
                <Icon name="info" size={14} className="shrink-0 mt-0.5" />
                <span>
                  Email <strong>{editing.email}</strong> is immutable from this page.
                </span>
              </div>
            )
          )}

          <FormField label="Username" required error={errors.username}>
            <input
              type="text"
              name="username"
              required
              value={form.username}
              onChange={onChange}
              placeholder="head.ce"
              className={INPUT_CLS}
            />
          </FormField>

          <FormField label="Role" required>
            <select
              name="role"
              required
              value={form.role}
              onChange={onChange}
              className={INPUT_CLS}
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
              {mode === 'edit' &&
                (form.role === 'administrator' || form.role === 'viewer') && (
                  <option value={form.role} className="capitalize">
                    {form.role.replace('_', ' ')}
                  </option>
                )}
            </select>
          </FormField>

          <div className="md:col-span-2">
            <FormField
              label={`Department${form.role === 'department_head' ? '' : ' (optional)'}`}
              required={form.role === 'department_head'}
              error={errors.deptId}
            >
              <select
                name="deptId"
                required={form.role === 'department_head'}
                value={form.deptId}
                onChange={onChange}
                className={INPUT_CLS}
              >
                <option value="">— none —</option>
                {departments
                  .filter((d) => d.isActive)
                  .map((d) => (
                    <option key={d.deptId} value={d.deptId}>
                      [{d.deptCode}] {d.deptName}
                    </option>
                  ))}
              </select>
            </FormField>
          </div>

          {mode === 'edit' && editing && (
            <div className="md:col-span-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-2">
              {editing.facultyId ? (
                <>
                  <span className="text-slate-700 inline-flex items-center gap-1.5">
                    <Icon name="badge" size={13} className="text-slate-500" />
                    Linked to{' '}
                    {facultyById.get(String(editing.facultyId))
                      ? `${facultyById.get(String(editing.facultyId))!.lastName}, ${facultyById.get(String(editing.facultyId))!.firstName}`
                      : `#${editing.facultyId}`}
                  </span>
                  {form.facultyId && (
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, facultyId: '' }))}
                      className="text-red-700 font-semibold hover:underline shrink-0"
                    >
                      Unlink
                    </button>
                  )}
                </>
              ) : (
                <span className="text-slate-500 italic">Not linked to any faculty record.</span>
              )}
            </div>
          )}

          <div className="md:col-span-2">
            <FormField
              label="Faculty record (optional)"
              hint={
                <>
                  {form.deptId
                    ? `Showing ${eligibleFaculty.length} faculty in this department. `
                    : 'Showing all active faculty. '}
                  Auto-suggested when the email matches a faculty record.
                </>
              }
            >
              <select
                name="facultyId"
                value={form.facultyId}
                onChange={onChange}
                className={INPUT_CLS}
              >
                <option value="">— not linked —</option>
                {eligibleFaculty.map((f) => {
                  const isMatch =
                    f.email &&
                    form.email &&
                    f.email.trim().toLowerCase() === form.email.trim().toLowerCase();
                  return (
                    <option key={f.facultyId} value={f.facultyId}>
                      {f.lastName}, {f.firstName}
                      {f.email ? ` (${f.email})` : ''}
                      {isMatch ? ' — email matches' : ''}
                    </option>
                  );
                })}
              </select>
            </FormField>
          </div>

          {emailMatch && String(emailMatch.facultyId) !== form.facultyId && (
            <div className="md:col-span-2 -mt-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2">
              <Icon name="auto_awesome" size={14} className="shrink-0 mt-0.5" />
              <span>
                Auto-detected: <strong>{emailMatch.lastName}, {emailMatch.firstName}</strong> has this email.
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, facultyId: String(emailMatch.facultyId) }))}
                  className="ml-2 font-semibold underline hover:text-emerald-700"
                >
                  Link it
                </button>
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end pt-4 border-t border-surface-variant mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
          >
            {submitting ? 'Saving…' : mode === 'create' ? 'Create User' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}