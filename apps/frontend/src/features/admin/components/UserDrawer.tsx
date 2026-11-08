import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/ui/Icon';
import StatusBadge, { ActiveBadge } from '@/components/ui/StatusBadge';
import { isAnyModalOpen } from '@/components/ui/Modal';
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Escape closes — but defer if a modal is on top.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isAnyModalOpen()) return; // modal will handle it
      onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock body scroll while open, restore exactly what was there before.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Reset copy state when target changes.
  useEffect(() => {
    setCopiedKey(null);
  }, [user?.userId]);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {
      /* clipboard may be blocked */
    }
  };

  if (typeof document === 'undefined') return null;
  if (!user) return null;

  const dept = user.deptId
    ? departments.find((d) => String(d.deptId) === String(user.deptId))
    : null;
  const fac = user.facultyId
    ? faculty.find((f) => String(f.facultyId) === String(user.facultyId))
    : null;

  const btnBase =
    'select-none transition duration-150 ease-out active:scale-[0.97] ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ' +
    'disabled:cursor-not-allowed';

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`User details: ${user.username}`}
        className={`fixed top-0 right-0 z-[110] h-screen w-full max-w-md bg-surface-container-lowest text-on-surface shadow-2xl flex flex-col transition-transform duration-200 ease-out border-l border-surface-variant ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-4 border-b border-surface-variant shrink-0">
          <span className="w-12 h-12 rounded-full bg-primary/20 text-primary text-base font-bold flex items-center justify-center shrink-0 border border-primary/30">
            {initials(user.username)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-on-surface text-base truncate">
              {user.username}
            </p>
            <button
              onClick={() => copy('email', user.email)}
              className={`text-xs text-on-surface-variant hover:text-primary inline-flex items-center gap-1 truncate max-w-full mt-0.5 ${btnBase}`}
              title="Copy email"
            >
              <span className="truncate">{user.email}</span>
              <Icon
                name={copiedKey === 'email' ? 'check' : 'content_copy'}
                size={11}
                className="shrink-0"
              />
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high ${btnBase}`}
            aria-label="Close"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Status row */}
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={ROLE_TONE[user.role] ?? 'neutral'}>
              {ROLE_LABELS[user.role] ?? user.role}
            </StatusBadge>
            <ActiveBadge isActive={user.isActive} />
            {isSelf && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-500 border border-amber-500/30">
                <Icon name="lock" size={10} />
                You
              </span>
            )}
          </div>

          <InfoSection title="Account" icon="person">
            <InfoRow
              label="Email"
              icon="mail"
              value={user.email}
              href={`mailto:${user.email}`}
              onCopy={() => copy('email', user.email)}
              copied={copiedKey === 'email'}
            />
            <InfoRow
              label="User ID"
              icon="fingerprint"
              value={`#${user.userId}`}
              mono
              onCopy={() => copy('userId', String(user.userId))}
              copied={copiedKey === 'userId'}
            />
            {user.employeeId && (
              <InfoRow
                label="Employee ID"
                icon="badge"
                value={user.employeeId}
                mono
                onCopy={() => copy('employeeId', user.employeeId!)}
                copied={copiedKey === 'employeeId'}
              />
            )}
            {user.wmsuId && (
              <InfoRow
                label="WMSU ID"
                icon="badge"
                value={user.wmsuId}
                mono
                onCopy={() => copy('wmsuId', user.wmsuId!)}
                copied={copiedKey === 'wmsuId'}
              />
            )}
          </InfoSection>

          <InfoSection title="Assignment" icon="assignment_ind">
            <InfoRow
              label="Department"
              icon="apartment"
              value={dept ? `[${dept.deptCode}] ${dept.deptName}` : '—'}
            />
            <InfoRow
              label="Faculty"
              icon="school"
              value={fac ? `${fac.lastName}, ${fac.firstName}` : '—'}
            />
          </InfoSection>

          <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-[11px] text-blue-900 flex items-start gap-2">
            <Icon name="info" size={13} className="shrink-0 mt-0.5" />
            <span>
              Email is immutable — deactivate and create a new account to
              change it.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-surface-variant bg-surface-container-low flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onToggleActive(user)}
            disabled={isSelf || isTogglePending}
            title={isSelf ? 'You cannot change your own status' : undefined}
            className={`px-3 py-2 text-xs font-semibold border border-surface-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-high rounded-lg disabled:opacity-50 flex items-center gap-1.5 ${btnBase}`}
          >
            <Icon name={user.isActive ? 'toggle_off' : 'toggle_on'} size={14} />
            {user.isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button
            type="button"
            onClick={() => onDelete(user)}
            disabled={isSelf}
            title={isSelf ? 'You cannot delete your own account' : undefined}
            className={`px-3 py-2 text-xs font-semibold border border-rose-500/30 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 rounded-lg flex items-center gap-1.5 disabled:opacity-50 ${btnBase}`}
          >
            <Icon name="delete" size={14} />
            Delete
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => onEdit(user)}
            className={`px-4 py-2 text-xs font-semibold bg-primary text-on-primary hover:opacity-90 rounded-lg flex items-center gap-1.5 ${btnBase}`}
          >
            <Icon name="edit" size={14} />
            Edit User
          </button>
        </div>
      </aside>
    </>,
    document.body,
  );
}

// ── Local helpers ──

function InfoSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon name={icon} size={14} className="text-primary" />
        <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
          {title}
        </h3>
        <div className="flex-1 h-px bg-surface-variant" />
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  icon,
  value,
  href,
  mono,
  onCopy,
  copied,
}: {
  label: string;
  icon: string;
  value: string;
  href?: string;
  mono?: boolean;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 group">
      <Icon name={icon} size={14} className="text-on-surface-variant shrink-0" />
      <span className="text-xs text-on-surface-variant w-24 shrink-0">
        {label}
      </span>
      {href ? (
        <a
          href={href}
          className="text-sm text-primary hover:underline truncate flex-1"
        >
          {value}
        </a>
      ) : (
        <span
          className={`text-sm text-on-surface truncate flex-1 ${
            mono ? 'font-mono' : ''
          }`}
        >
          {value}
        </span>
      )}
      {onCopy && (
        <button
          type="button"
          onClick={onCopy}
          className="opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface"
          title="Copy"
          aria-label={`Copy ${label}`}
        >
          <Icon name={copied ? 'check' : 'content_copy'} size={12} />
        </button>
      )}
    </div>
  );
}