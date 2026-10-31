import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchUsers,
  createUser,
  updateUser,
  toggleUserActive,
  deleteUser,
  type UserRecord,
  type UserRole,
} from '../../api/users.api';
import { useAuthStore } from '../../store/auth.store';
import { fetchDepartments } from '../../api/departments.api';
import { fetchFaculty } from '../../api/faculty.api';
import { login } from '../../api/auth.api';
import Icon from '@/components/ui/Icon';
import Modal from '@/components/ui/Modal';
import ResponsiveTable, { type Column } from '@/components/ui/ResponsiveTable';
import type { RowAction } from '@/components/ui/RowActionMenu';
import StatusBadge, { ActiveBadge } from '@/components/ui/StatusBadge';

type Mode = 'create' | 'edit';

const ROLE_TONE: Record<string, 'danger' | 'warning' | 'info' | 'neutral'> = {
  administrator: 'danger',
  college_dean: 'warning',
  department_head: 'info',
  viewer: 'neutral',
};

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [searchParams] = useSearchParams();

  const [mode, setMode] = useState<Mode | null>(null);
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get('q') ?? '',
  );
  const [roleFilter, setRoleFilter] = useState<
    'all' | 'college_dean' | 'department_head'
  >('all');
  const [deptListFilter, setDeptListFilter] = useState<string>('all');

  // Global search links here with ?q=... so the matching account is visible
  // immediately, including when the page is already mounted.
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setSearchQuery(q);
  }, [searchParams]);

  const [form, setForm] = useState({
    email: '',
    password: '',
    username: '',
    role: 'department_head' as UserRole,
    deptId: '',
    facultyId: '',
  });

  const [actionTarget, setActionTarget] = useState<{
    user: UserRecord;
    action: 'delete';
  } | null>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    enabled: !!user,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => fetchDepartments(),
    enabled: !!user,
  });

  const { data: faculty = [] } = useQuery({
    queryKey: ['faculty', { includeInactive: false }],
    queryFn: () => fetchFaculty(false),
    enabled: !!user,
  });

  // ═══════════════════════════════════════════════════════
  // Faculty link helpers
  // ═══════════════════════════════════════════════════════

  const facultyById = useMemo(() => {
    const m = new Map<string, (typeof faculty)[number]>();
    for (const f of faculty) m.set(String(f.facultyId), f);
    return m;
  }, [faculty]);

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
    if (match) {
      setForm((prev) => ({ ...prev, facultyId: match.facultyId }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.email, faculty, mode, form.deptId]);

  const eligibleFaculty = useMemo(() => {
    if (!form.deptId) {
      return faculty.filter((f) => f.isActive);
    }
    return faculty.filter(
      (f) =>
        f.isActive &&
        String(f.deptId ?? '') === String(form.deptId),
    );
  }, [faculty, form.deptId]);

  const currentFacultyMatch = useMemo(() => {
    if (!form.email) return null;
    const typed = form.email.trim().toLowerCase();
    return (
      eligibleFaculty.find(
        (f) => f.email && f.email.trim().toLowerCase() === typed,
      ) ?? null
    );
  }, [eligibleFaculty, form.email]);

  // ═══════════════════════════════════════════════════════
  // Mutations
  // ═══════════════════════════════════════════════════════

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: (u) => {
      setSuccess(`User "${u.username}" created.`);
      closeForm();
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) =>
      setError(
        err?.response?.data?.message ?? err.message ?? 'Failed to create user',
      ),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: any }) =>
      updateUser(id, input),
    onSuccess: (u) => {
      setSuccess(`User "${u.username}" updated.`);
      closeForm();
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) =>
      setError(
        err?.response?.data?.message ?? err.message ?? 'Failed to update user',
      ),
  });

  const toggleMutation = useMutation({
    mutationFn: toggleUserActive,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Toggle failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      setSuccess('User deleted.');
      qc.invalidateQueries({ queryKey: ['users'] });
      closeAction();
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Delete failed'),
  });

  // ═══════════════════════════════════════════════════════
  // Form lifecycle
  // ═══════════════════════════════════════════════════════

  const closeForm = () => {
    setMode(null);
    setEditing(null);
    setForm({
      email: '',
      password: '',
      username: '',
      role: 'department_head',
      deptId: '',
      facultyId: '',
    });
    setError(null);
  };

  const closeAction = () => {
    setActionTarget(null);
    setAdminPassword('');
    setVerifyError(null);
    setIsVerifying(false);
  };

  const openCreate = () => {
    setMode('create');
    setEditing(null);
    setForm({
      email: '',
      password: '',
      username: '',
      role: 'department_head',
      deptId: '',
      facultyId: '',
    });
    setError(null);
    setSuccess(null);
  };

  const openEdit = (u: UserRecord) => {
    setMode('edit');
    setEditing(u);
    setForm({
      email: u.email,
      password: '',
      username: u.username,
      role: u.role,
      deptId: u.deptId ?? '',
      facultyId: u.facultyId ?? '',
    });
    setError(null);
    setSuccess(null);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
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
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const isDeptHead = form.role === 'department_head';
    if (isDeptHead && !form.deptId) {
      setError('Department Heads must be assigned to a department.');
      return;
    }

    if (mode === 'create') {
      const isEmailTaken = users.some((u) => u.email === form.email);
      const isUsernameTaken = users.some((u) => u.username === form.username);
      if (isEmailTaken) {
        setError('This email is already in use.');
        return;
      }
      if (isUsernameTaken) {
        setError('This username is already taken.');
        return;
      }

      const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
      if (!passwordRegex.test(form.password)) {
        setError(
          'Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character.',
        );
        return;
      }

      createMutation.mutate({
        email: form.email,
        password: form.password,
        username: form.username,
        role: form.role,
        deptId: form.deptId || undefined,
        facultyId: form.facultyId || undefined,
      });
    } else if (mode === 'edit' && editing) {
      const payload: any = {};
      if (form.username !== editing.username) payload.username = form.username;
      if (form.role !== editing.role) payload.role = form.role;
      if ((form.deptId || null) !== editing.deptId)
        payload.deptId = form.deptId || null;
      if ((form.facultyId || null) !== editing.facultyId)
        payload.facultyId = form.facultyId || null;

      if (Object.keys(payload).length === 0) {
        setError('No changes to save.');
        return;
      }

      updateMutation.mutate({ id: editing.userId, input: payload });
    }
  };

  const handleConfirmAction = async () => {
    if (!user?.email || !actionTarget) return;
    setIsVerifying(true);
    setVerifyError(null);
    try {
      await login({ email: user.email, password: adminPassword });
      deleteMutation.mutate(actionTarget.user.userId);
    } catch (err: any) {
      setVerifyError(err?.response?.data?.message || 'Incorrect password');
      setIsVerifying(false);
    }
  };

  const deptName = (id: string | null) => {
    if (!id) return '—';
    const d = departments.find((x) => String(x.deptId) === String(id));
    return d ? `[${d.deptCode}] ${d.deptName}` : `Dept #${id}`;
  };

  const visibleUsers = useMemo(
    () => users.filter((u) => u.role !== 'administrator'),
    [users],
  );

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleUsers.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (deptListFilter !== 'all') {
        const matchDept =
          String(u.deptId ?? '') === deptListFilter ||
          (deptListFilter === 'none' && !u.deptId);
        if (!matchDept) return false;
      }
      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.employeeId ?? '').toLowerCase().includes(q) ||
        (u.wmsuId ?? '').toLowerCase().includes(q)
      );
    });
  }, [visibleUsers, searchQuery, roleFilter, deptListFilter]);

  // ═══════════════════════════════════════════════════════
  // Columns
  // ═══════════════════════════════════════════════════════

  const columns: Column<UserRecord>[] = [
    {
      key: 'user',
      header: 'User',
      cardVariant: 'title',
      cellClassName: 'text-on-surface font-medium',
      render: (u) => u.username,
    },
    {
      key: 'email',
      header: 'Email',
      cardVariant: 'subtitle',
      cellClassName: 'text-on-surface-variant text-xs',
      render: (u) => u.email,
    },
    {
      key: 'role',
      header: 'Role',
      cardVariant: 'badge',
      render: (u) => (
        <StatusBadge tone={ROLE_TONE[u.role] ?? 'neutral'}>
          <span className="capitalize">{u.role.replace('_', ' ')}</span>
        </StatusBadge>
      ),
    },
    {
      key: 'dept',
      header: 'Department',
      cardVariant: 'meta',
      cellClassName: 'text-on-surface-variant text-xs font-medium',
      render: (u) => deptName(u.deptId),
    },
    {
      key: 'faculty',
      header: 'Faculty',
      cardVariant: 'meta',
      cellClassName: 'text-on-surface-variant text-xs',
      render: (u) => {
        if (!u.facultyId) {
          return <span className="text-slate-300">—</span>;
        }
        const f = facultyById.get(String(u.facultyId));
        if (!f) {
          return (
            <span className="italic text-slate-400">
              #{u.facultyId}
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 text-slate-700">
            <Icon name="badge" size={11} className="text-slate-400" />
            {f.lastName}, {f.firstName}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      cardVariant: 'badge',
      render: (u) => <ActiveBadge isActive={u.isActive} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      cardVariant: 'actions',
      render: () => null,
    },
  ];

  const getActions = (u: UserRecord): RowAction[] => {
    const isSelf = user?.id === u.userId;

    return [
      { label: 'Edit', icon: 'edit', onClick: () => openEdit(u) },
      {
        label: u.isActive ? 'Deactivate' : 'Activate',
        icon: u.isActive ? 'toggle_off' : 'toggle_on',
        onClick: () => toggleMutation.mutate(u.userId),
        disabled: toggleMutation.isPending || isSelf,
      },
      {
        label: 'Delete',
        icon: 'delete',
        danger: true,
        onClick: () => setActionTarget({ user: u, action: 'delete' }),
        disabled: isSelf,
      },
    ];
  };

  // ═══════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3" data-tour="users-header">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Users</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            {visibleUsers.length} user account(s) registered
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
        >
          <Icon name="person_add" size={18} />
          New User
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-100 border border-green-300 text-green-700 text-sm">
          {success}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-surface-variant bg-surface-container-lowest" data-tour="users-filters">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
            Search
          </label>
          <div className="relative">
            <Icon
              name="search"
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Name, email, employee ID, or WMSU ID…"
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="min-w-[200px]">
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
            Department
          </label>
          <select
            value={deptListFilter}
            onChange={(e) => setDeptListFilter(e.target.value)}
            className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
          >
            <option value="all">All departments</option>
            <option value="none">— no department —</option>
            {departments
              .filter((d) => d.isActive)
              .map((d) => (
                <option key={d.deptId} value={d.deptId}>
                  [{d.deptCode}] {d.deptName}
                </option>
              ))}
          </select>
        </div>

        <div className="min-w-[160px]">
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
            Role
          </label>
          <select
            value={roleFilter}
            onChange={(e) =>
              setRoleFilter(
                e.target.value as 'all' | 'college_dean' | 'department_head',
              )
            }
            className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
          >
            <option value="all">All roles</option>
            <option value="college_dean">College Dean</option>
            <option value="department_head">Department Head</option>
          </select>
        </div>

        {(searchQuery || roleFilter !== 'all' || deptListFilter !== 'all') && (
          <button
            onClick={() => {
              setSearchQuery('');
              setRoleFilter('all');
              setDeptListFilter('all');
            }}
            className="text-xs px-3 py-2 rounded-lg border border-surface-variant text-on-surface-variant hover:bg-surface-container-low transition"
          >
            Clear
          </button>
        )}
        <div className="ml-auto text-xs text-on-surface-variant">
          Showing <strong className="text-on-surface">{filteredUsers.length}</strong> of{' '}
          {visibleUsers.length}
        </div>
      </div>

      <div data-tour="users-table">
        <ResponsiveTable
          columns={columns}
          rows={filteredUsers}
          rowKey={(u) => u.userId}
          rowTitle={(u) => u.username}
          rowSubtitle={(u) => u.email}
          isLoading={isLoading}
          hasSourceRows={visibleUsers.length > 0}
          emptyMessage="No users yet."
          noMatchMessage="No users match your filters."
          getActions={getActions}
          onRowClick={(u) => openEdit(u)}
        />
      </div>

      {/* Create/Edit Modal */}
      <Modal
        open={!!mode}
        onClose={closeForm}
        title={
          mode === 'create'
            ? 'Create User'
            : `Edit User — ${editing?.username}`
        }
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mode === 'create' && (
              <>
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                    Email *
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={form.email}
                    onChange={handleChange}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
                    placeholder="head@wmsu.edu.ph"
                  />
                </div>
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                    Password *
                  </label>
                  <input
                    type="password"
                    name="password"
                    required
                    minLength={8}
                    value={form.password}
                    onChange={handleChange}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
                    placeholder="Must be strong"
                  />
                  <p className="text-[10px] text-on-surface-variant mt-1 leading-tight">
                    Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 symbol.
                  </p>
                </div>
              </>
            )}

            {mode === 'edit' && editing && (
              <div className="md:col-span-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-start gap-2">
                <Icon name="info" size={14} className="shrink-0 mt-0.5" />
                <span>
                  Email <strong>{editing.email}</strong> is immutable from
                  this page. To change it, deactivate this account and create
                  a new one.
                </span>
              </div>
            )}

            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Username *
              </label>
              <input
                type="text"
                name="username"
                required
                value={form.username}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
                placeholder="head.ce"
              />
            </div>

            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Role *
              </label>
              <select
                name="role"
                required
                value={form.role}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              >
                <option value="department_head">Department Head</option>
                <option value="college_dean">College Dean</option>
                {mode === 'edit' &&
                  (form.role === 'administrator' || form.role === 'viewer') && (
                    <option value={form.role} className="capitalize">
                      {form.role.replace('_', ' ')}
                    </option>
                  )}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Department {form.role === 'department_head' ? '*' : '(optional)'}
              </label>
              <select
                name="deptId"
                required={form.role === 'department_head'}
                value={form.deptId}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
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
            </div>

            {/* Faculty link section */}
            {mode === 'edit' && editing && (
              <div className="md:col-span-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-2">
                {editing.facultyId ? (
                  <>
                    <span className="text-slate-700 inline-flex items-center gap-1.5">
                      <Icon name="badge" size={13} className="text-slate-500" />
                      Currently linked to faculty record
                      {facultyById.get(String(editing.facultyId)) ? (
                        <strong className="text-slate-900">
                          {' '}
                          {facultyById.get(String(editing.facultyId))!.lastName}
                          ,{' '}
                          {facultyById.get(String(editing.facultyId))!.firstName}
                        </strong>
                      ) : (
                        <strong className="text-slate-900">
                          {' '}
                          #{editing.facultyId}
                        </strong>
                      )}
                    </span>
                    {form.facultyId && (
                      <button
                        type="button"
                        onClick={() =>
                          setForm((p) => ({ ...p, facultyId: '' }))
                        }
                        className="text-red-700 font-semibold hover:underline shrink-0"
                      >
                        Unlink
                      </button>
                    )}
                  </>
                ) : (
                  <span className="text-slate-500 italic">
                    Not linked to any faculty record.
                  </span>
                )}
              </div>
            )}

            <div className="md:col-span-2">
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Faculty record (optional)
              </label>
              <select
                name="facultyId"
                value={form.facultyId}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              >
                <option value="">— not linked —</option>
                {eligibleFaculty.map((f) => {
                  const isMatch =
                    f.email &&
                    form.email &&
                    f.email.trim().toLowerCase() ===
                      form.email.trim().toLowerCase();
                  return (
                    <option key={f.facultyId} value={f.facultyId}>
                      {f.lastName}, {f.firstName}
                      {f.email ? ` (${f.email})` : ''}
                      {isMatch ? ' — email matches' : ''}
                    </option>
                  );
                })}
              </select>
              <p className="text-[10px] text-on-surface-variant mt-1 leading-tight">
                {form.deptId
                  ? `Showing ${eligibleFaculty.length} faculty in this department. `
                  : 'Showing all active faculty. '}
                Auto-suggested when the email matches a faculty record.
              </p>
            </div>

            {currentFacultyMatch &&
              String(currentFacultyMatch.facultyId) !== form.facultyId && (
                <div className="md:col-span-2 -mt-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2">
                  <Icon
                    name="auto_awesome"
                    size={14}
                    className="shrink-0 mt-0.5"
                  />
                  <span>
                    Auto-detected:{' '}
                    <strong>
                      {currentFacultyMatch.lastName},{' '}
                      {currentFacultyMatch.firstName}
                    </strong>{' '}
                    has this email.
                    <button
                      type="button"
                      onClick={() =>
                        setForm((p) => ({
                          ...p,
                          facultyId: currentFacultyMatch.facultyId,
                        }))
                      }
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
              onClick={closeForm}
              className="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-6 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : mode === 'create'
                ? 'Create User'
                : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        open={!!actionTarget}
        onClose={closeAction}
        title="Confirm deletion"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={closeAction}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmAction}
              disabled={isVerifying || !adminPassword}
              className="px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50 bg-red-600 hover:bg-red-700"
            >
              {isVerifying ? 'Verifying...' : 'Delete'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            User:{' '}
            <strong>{actionTarget?.user.username}</strong> (
            {actionTarget?.user.email})
          </p>
          <p className="text-xs text-slate-500">
            This will permanently delete the account. Cannot be undone.
          </p>
          {verifyError && (
            <div className="p-2 bg-red-100 text-red-700 text-xs">
              {verifyError}
            </div>
          )}
          <input
            type="password"
            placeholder="Your admin password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none focus:border-primary"
          />
        </div>
      </Modal>
    </div>
  );
}