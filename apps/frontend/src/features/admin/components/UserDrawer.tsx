import { useEffect, useState, type ReactNode } from 'react';
import Icon from '@/components/ui/Icon';
import StatusBadge, { ActiveBadge } from '@/components/ui/StatusBadge';
import { ROLE_LABELS, ROLE_TONE, initials } from './constants';
import type { UserRecord, DeptLite, FacultyLite } from './types';

interface Props {
  open: boolean;
  user: UserRecord | null;
  onClose: () => void;
  onEdit: (u: UserRecord) => void;
  onDelete: (u: UserRecord) => void;
  onToggleActive: (u: UserRecord) => void;
  departments: DeptLite[];
  faculty: FacultyLite[];
  isSelf: boolean;
  isTogglePending: boolean;
}

export default function UserDrawer({
  open,
  user,
  onClose,
  onEdit,
  onDelete,
  onToggleActive,
  departments,
  faculty,
  isSelf,
  isTogglePending,
}: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  useEffect(() => setCopied(false), [user?.userId]);

  const dept = user?.deptId
    ? departments.find((d) => String(d.deptId) === String(user.deptId))
    : null;
  const fac = user?.facultyId
    ? faculty.find((f) => String(f.facultyId) === String(user.facultyId))
    : null;

  const copyEmail = async () => {
    if (!user?.email) return;
    try {
      await navigator.clipboard.writeText(user.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* no-op */
    }
  };

  return (
    <div className={`fixed inset-0 z-40 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="User details"
        className={`absolute right-0 top-0 h-full w-full sm:w-[440px] bg-surface-container-lowest shadow-2xl flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {user && (
          <>
            <header className="flex items-start justify-between gap-3 p-5 border-b border-surface-variant">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-12 w-12 rounded-full bg-primary/10 text-primary grid place-items-center font-bold shrink-0">
                  {initials(user.username)}
                </div>
                <div className="min-w-0">
                  <h2 className="font-bold text-on-surface truncate">{user.username}</h2>
                  <button
                    onClick={copyEmail}
                    className="text-xs text-on-surface-variant hover:text-primary inline-flex items-center gap-1 truncate max-w-full"
                    title="Copy email"
                  >
                    <span className="truncate">{user.email}</span>
                    <Icon name={copied ? 'check' : 'content_copy'} size={11} className="shrink-0" />
                  </button>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-low"
                aria-label="Close"
              >
                <Icon name="close" size={18} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={ROLE_TONE[user.role] ?? 'neutral'}>
                  {ROLE_LABELS[user.role] ?? user.role}
                </StatusBadge>
                <ActiveBadge isActive={user.isActive} />
              </div>

              <section>
                <h3 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                  Account
                </h3>
                <dl className="space-y-2">
                  <Row icon="mail" label="Email" value={user.email} />
                  <Row icon="badge" label="User ID" value={`#${user.userId}`} />
                  {user.employeeId && <Row icon="badge" label="Employee ID" value={user.employeeId} />}
                  {user.wmsuId && <Row icon="badge" label="WMSU ID" value={user.wmsuId} />}
                </dl>
              </section>

              <section>
                <h3 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                  Assignment
                </h3>
                <dl className="space-y-2">
                  <Row
                    icon="apartment"
                    label="Department"
                    value={dept ? `[${dept.deptCode}] ${dept.deptName}` : '—'}
                  />
                  <Row
                    icon="school"
                    label="Faculty record"
                    value={fac ? `${fac.lastName}, ${fac.firstName}` : '—'}
                  />
                </dl>
              </section>

              <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-[11px] text-blue-900 flex items-start gap-2">
                <Icon name="info" size={13} className="shrink-0 mt-0.5" />
                <span>Email is immutable — deactivate and create a new account to change it.</span>
              </div>
            </div>

            <footer className="p-4 border-t border-surface-variant grid grid-cols-2 gap-2">
              <button
                onClick={() => onEdit(user)}
                className="col-span-2 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition inline-flex items-center justify-center gap-1.5"
              >
                <Icon name="edit" size={16} /> Edit user
              </button>
              <button
                onClick={() => onToggleActive(user)}
                disabled={isSelf || isTogglePending}
                title={isSelf ? 'You cannot change your own status' : undefined}
                className="px-3 py-2 rounded-lg border border-surface-variant text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low transition disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
              >
                <Icon name={user.isActive ? 'toggle_off' : 'toggle_on'} size={16} />
                {isTogglePending ? 'Updating…' : user.isActive ? 'Deactivate' : 'Activate'}
              </button>
              <button
                onClick={() => onDelete(user)}
                disabled={isSelf}
                title={isSelf ? 'You cannot delete your own account' : undefined}
                className="px-3 py-2 rounded-lg border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50 transition disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
              >
                <Icon name="delete" size={16} /> Delete
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-xs text-on-surface-variant inline-flex items-center gap-1.5 shrink-0">
        <Icon name={icon} size={13} className="text-slate-400" /> {label}
      </dt>
      <dd className="text-xs text-on-surface text-right break-all">{value}</dd>
    </div>
  );
}