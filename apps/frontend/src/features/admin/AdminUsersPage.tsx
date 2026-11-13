import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchUsers,
  createUser,
  updateUser,
  toggleUserActive,
  deleteUser,
  type UserRecord,
} from '../../api/users.api';
import { useAuthStore } from '../../store/auth.store';
import { fetchDepartments } from '../../api/departments.api';
import { fetchFaculty } from '../../api/faculty.api';
import { reauthenticate } from '../../api/auth.api';
import Icon from '@/components/ui/Icon';
import ResponsiveTable, { type Column } from '@/components/ui/ResponsiveTable';
import type { RowAction } from '@/components/ui/RowActionMenu';
import StatusBadge, { ActiveBadge } from '@/components/ui/StatusBadge';
import {
  UserStatsCards,
  UserFilters,
  UserDrawer,
  UserFormModal,
  DeleteUserModal,
  type RoleFilterValue,
} from './components';
import { ROLE_LABELS, ROLE_TONE } from './components/constants';

type Mode = 'create' | 'edit';

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [searchParams, setSearchParams] = useSearchParams();

  const [formMode, setFormMode] = useState<Mode | null>(null);
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [drawerUserId, setDrawerUserId] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<UserRecord | null>(null);

  const [pageError, setPageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '');
  const [roleFilter, setRoleFilter] = useState<RoleFilterValue>('all');
  const [deptListFilter, setDeptListFilter] = useState<string>('all');

  // Global search links here with ?q=...
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setSearchQuery(q);
  }, [searchParams]);

  // Auto-dismiss success toast
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

  // ── Data ─────────────────────────────────────────────────────────────
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    enabled: !!user,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => fetchDepartments(),
    enabled: !!user,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });

  const { data: faculty = [] } = useQuery({
    queryKey: ['faculty', { includeInactive: false }],
    queryFn: () => fetchFaculty(false),
    enabled: !!user,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });

  const facultyById = useMemo(() => {
    const m = new Map<string, (typeof faculty)[number]>();
    for (const f of faculty) m.set(String(f.facultyId), f);
    return m;
  }, [faculty]);

  // ── Mutations ────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: (u) => {
      setSuccess(`User "${u.username}" created.`);
      closeForm();
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) =>
      setFormError(err?.response?.data?.message ?? err.message ?? 'Failed to create user'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: any }) => updateUser(id, input),
    onSuccess: (u) => {
      setSuccess(`User "${u.username}" updated.`);
      closeForm();
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) =>
      setFormError(err?.response?.data?.message ?? err.message ?? 'Failed to update user'),
  });

  const toggleMutation = useMutation({
    mutationFn: toggleUserActive,
    onMutate: async (userId: string) => {
      await qc.cancelQueries({ queryKey: ['users'] });
      const prev = qc.getQueryData<UserRecord[]>(['users']);
      qc.setQueryData<UserRecord[]>(['users'], (old) =>
        old?.map((u) =>
          String(u.userId) === String(userId) ? { ...u, isActive: !u.isActive } : u,
        ),
      );
      return { prev };
    },
    onError: (err: any, _userId, ctx) => {
      if (ctx?.prev) qc.setQueryData(['users'], ctx.prev);
      setPageError(err?.response?.data?.message ?? 'Toggle failed');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: (_data, userId) => {
      qc.setQueryData<UserRecord[]>(['users'], (old) =>
        old?.filter((u) => String(u.userId) !== String(userId)),
      );
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    // No onError — DeleteUserModal handles it via promise rejection.
  });

  // ── Handlers ─────────────────────────────────────────────────────────
  const closeForm = () => {
    setFormMode(null);
    setEditing(null);
    setFormError(null);
  };

  const openCreate = () => {
    setFormMode('create');
    setEditing(null);
    setFormError(null);
    setPageError(null);
    setSuccess(null);
  };

  const openEdit = (u: UserRecord) => {
    setDrawerUserId(null);
    setFormMode('edit');
    setEditing(u);
    setFormError(null);
  };

  // Deep-link receiver: /users?user=<id>  →  opens the drawer.
  const lastUserParam = useRef<string | null>(null);
  useEffect(() => {
    const userId = searchParams.get('user');
    if (!userId || userId === lastUserParam.current) return;
    if (isLoading) return;
    const match = users.find((u) => String(u.userId) === userId);
    lastUserParam.current = userId;
    if (match) setDrawerUserId(match.userId);
    const next = new URLSearchParams(searchParams);
    next.delete('user');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, users, isLoading]);

  const handleDeleteConfirm = async (password: string) => {
    if (!user?.email || !actionTarget) return;
    await reauthenticate(password);                          // throws on bad password
    await deleteMutation.mutateAsync(actionTarget.userId);  // throws on delete failure
    setSuccess(`User "${actionTarget.username}" deleted.`);
    if (String(drawerUserId) === String(actionTarget.userId)) setDrawerUserId(null);
    setActionTarget(null);
  };

  const deptName = (id: string | null) => {
    if (!id) return '—';
    const d = departments.find((x) => String(x.deptId) === String(id));
    return d ? `[${d.deptCode}] ${d.deptName}` : `Dept #${id}`;
  };

  // ── Derived lists ────────────────────────────────────────────────────
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

  const drawerUser = useMemo(
    () => users.find((u) => String(u.userId) === String(drawerUserId)) ?? null,
    [users, drawerUserId],
  );

  // ── Columns ──────────────────────────────────────────────────────────
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
          {ROLE_LABELS[u.role] ?? u.role}
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
        if (!u.facultyId) return <span className="text-slate-300">—</span>;
        const f = facultyById.get(String(u.facultyId));
        if (!f) return <span className="italic text-slate-400">#{u.facultyId}</span>;
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
    { key: 'actions', header: 'Actions', cardVariant: 'actions', render: () => null },
  ];

  const getActions = (u: UserRecord): RowAction[] => {
    const isSelf = user?.id === u.userId;
    return [
      { label: 'View details', icon: 'visibility', onClick: () => setDrawerUserId(u.userId) },
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
        onClick: () => setActionTarget(u),
        disabled: isSelf,
      },
    ];
  };

  const isFiltered = !!searchQuery || roleFilter !== 'all' || deptListFilter !== 'all';

  // ── Render ───────────────────────────────────────────────────────────
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

      <UserStatsCards users={visibleUsers} loading={isLoading} />

      {pageError && (
        <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm flex items-center justify-between gap-2">
          <span>{pageError}</span>
          <button onClick={() => setPageError(null)} aria-label="Dismiss" className="text-red-600">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-100 border border-green-300 text-green-700 text-sm flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="check_circle" size={14} /> {success}
          </span>
          <button onClick={() => setSuccess(null)} aria-label="Dismiss" className="text-green-700">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      <UserFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        roleFilter={roleFilter}
        onRoleChange={setRoleFilter}
        deptFilter={deptListFilter}
        onDeptChange={setDeptListFilter}
        departments={departments}
        shown={filteredUsers.length}
        total={visibleUsers.length}
        onClear={() => {
          setSearchQuery('');
          setRoleFilter('all');
          setDeptListFilter('all');
        }}
      />

      <div data-tour="users-table">
        <ResponsiveTable
          columns={columns}
          rows={filteredUsers}
          rowKey={(u) => u.userId}
          rowTitle={(u) => u.username}
          rowSubtitle={(u) => u.email}
          isLoading={isLoading}
          hasSourceRows={visibleUsers.length > 0}
          emptyMessage={
            isFiltered ? 'No users match your filters.' : 'No users yet. Create the first one.'
          }
          noMatchMessage="No users match your filters."
          getActions={getActions}
          onRowClick={(u) => setDrawerUserId(u.userId)}
        />
      </div>

      <UserDrawer
        open={!!drawerUser}
        user={drawerUser}
        onClose={() => setDrawerUserId(null)}
        onEdit={openEdit}
        onDelete={(u) => {
          setDrawerUserId(null);
          setActionTarget(u);
        }}
        onToggleActive={(u) => toggleMutation.mutate(u.userId)}
        departments={departments}
        faculty={faculty}
        isSelf={!!drawerUser && user?.id === drawerUser.userId}
        isTogglePending={toggleMutation.isPending}
      />

      {formMode && (
        <UserFormModal
          open={!!formMode}
          mode={formMode}
          editing={editing}
          onClose={closeForm}
          departments={departments}
          faculty={faculty}
          users={users}
          submitting={createMutation.isPending || updateMutation.isPending}
          serverError={formError}
          onCreate={(input) => createMutation.mutate(input as any)}
          onUpdate={(id, input) => updateMutation.mutate({ id, input })}
        />
      )}

      <DeleteUserModal
        open={!!actionTarget}
        user={actionTarget}
        onClose={() => setActionTarget(null)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}