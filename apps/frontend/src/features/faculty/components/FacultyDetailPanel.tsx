import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../../components/ui/Icon';
import StatusBadge, { ActiveBadge } from '../../../components/ui/StatusBadge';
import { isAnyModalOpen } from '../../../components/ui/Modal';
import type { FacultyRecord, FacultyClass } from '../../../api/faculty.api';

const CLASS_TONE: Record<FacultyClass, 'info' | 'warning' | 'purple' | 'neutral'> = {
  regular: 'info',
  part_time: 'warning',
  visiting_lecturer: 'purple',
  other: 'neutral',
};

interface StatusInfo {
  hasQualifications: boolean;
  hasPreferences: boolean;
  hasUnavailability: boolean;
  qualificationCount?: number;
  preferenceCount?: number;
  unavailabilityCount?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  faculty: FacultyRecord | null;
  departmentLabel: (id: string | null) => string;
  designationLabel: (id: string | null) => string;
  status?: StatusInfo;
  isForeign?: boolean;
  onEdit: () => void;
  onOpenQualifications: () => void;
  onOpenPreferences: () => void;
  onOpenUnavailability: () => void;
  onToggleActive: () => void;
  onDelete?: () => void;
  togglePending?: boolean;
}

type Tab = 'profile' | 'records';

export default function FacultyDetailPanel({
  open,
  onClose,
  faculty,
  departmentLabel,
  designationLabel,
  status,
  isForeign = false,
  onEdit,
  onOpenQualifications,
  onOpenPreferences,
  onOpenUnavailability,
  onToggleActive,
  onDelete,
  togglePending = false,
}: Props) {
  const [tab, setTab] = useState<Tab>('profile');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Reset tab when a different faculty opens.
  useEffect(() => {
    if (open) setTab('profile');
  }, [faculty?.facultyId, open]);

  // Close on Escape — but defer to any modal above us.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isAnyModalOpen()) return; // a modal will handle it
      onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {
      /* clipboard may be blocked */
    }
  };

  if (!faculty) return null;
  if (typeof document === 'undefined') return null;

  const fullName = `${faculty.lastName}, ${faculty.firstName}`;
  const initials =
    `${faculty.firstName[0] ?? ''}${faculty.lastName[0] ?? ''}`.toUpperCase();

  const configuredCount = [
    !!status?.hasQualifications,
    !!status?.hasPreferences,
    !!status?.hasUnavailability,
  ].filter(Boolean).length;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Faculty details: ${fullName}`}
        className={`fixed top-0 right-0 z-[110] h-screen w-full max-w-md bg-surface-container-lowest text-on-surface shadow-2xl flex flex-col transition-transform duration-200 ease-out border-l border-surface-variant ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-4 border-b border-surface-variant shrink-0">
          <span className="w-12 h-12 rounded-full bg-primary/20 text-primary text-base font-bold flex items-center justify-center shrink-0 border border-primary/30">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-on-surface text-base truncate">
              {fullName}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <StatusBadge tone={CLASS_TONE[faculty.classification]}>
                {faculty.classification.replace('_', ' ')}
              </StatusBadge>
              <ActiveBadge isActive={faculty.isActive} />
              {isForeign && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-500 border border-amber-500/30"
                  title="Read-only — belongs to another department"
                >
                  <Icon name="lock" size={10} />
                  Read only
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition"
            aria-label="Close panel"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-surface-variant px-2 shrink-0">
          {(
            [
              { key: 'profile', label: 'Profile', icon: 'badge' },
              {
                key: 'records',
                label: 'Records',
                icon: 'folder',
                badge: configuredCount,
              },
            ] as { key: Tab; label: string; icon: string; badge?: number }[]
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition ${
                tab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Icon name={t.icon} size={14} />
              {t.label}
              {t.badge != null && (
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    tab === t.key
                      ? 'bg-primary/20 text-primary'
                      : 'bg-surface-container-high text-on-surface-variant'
                  }`}
                >
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {tab === 'profile' && (
            <ProfileTab
              faculty={faculty}
              departmentLabel={departmentLabel}
              designationLabel={designationLabel}
              copiedKey={copiedKey}
              onCopy={copy}
            />
          )}

          {tab === 'records' && (
            <RecordsTab
              status={status}
              configuredCount={configuredCount}
              isForeign={isForeign}
              onOpenQualifications={onOpenQualifications}
              onOpenPreferences={onOpenPreferences}
              onOpenUnavailability={onOpenUnavailability}
            />
          )}
        </div>

        {/* Footer actions */}
        <div className="p-3 border-t border-surface-variant bg-surface-container-low flex items-center gap-2 shrink-0">
          {!isForeign ? (
            <>
              <button
                type="button"
                onClick={onToggleActive}
                disabled={togglePending}
                className="px-3 py-2 text-xs font-semibold border border-surface-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-high transition rounded-lg disabled:opacity-50 flex items-center gap-1.5"
              >
                <Icon
                  name={faculty.isActive ? 'toggle_off' : 'toggle_on'}
                  size={14}
                />
                {faculty.isActive ? 'Deactivate' : 'Activate'}
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="px-3 py-2 text-xs font-semibold border border-rose-500/30 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition rounded-lg flex items-center gap-1.5"
                >
                  <Icon name="delete" size={14} />
                  Delete
                </button>
              )}
              <div className="flex-1" />
              <button
                type="button"
                onClick={onEdit}
                className="px-4 py-2 text-xs font-semibold bg-primary text-on-primary hover:opacity-90 transition rounded-lg flex items-center gap-1.5"
              >
                <Icon name="edit" size={14} />
                Edit Profile
              </button>
            </>
          ) : (
            <p className="text-[11px] text-on-surface-variant italic flex items-center gap-1.5">
              <Icon name="lock" size={12} />
              Read-only — belongs to another department.
            </p>
          )}
        </div>
      </aside>
    </>,
    document.body
  );
}

// ── Tab: Profile ──

function ProfileTab({
  faculty,
  departmentLabel,
  designationLabel,
  copiedKey,
  onCopy,
}: {
  faculty: FacultyRecord;
  departmentLabel: (id: string | null) => string;
  designationLabel: (id: string | null) => string;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => void;
}) {
  const hasContact = faculty.email || faculty.contact;
  const hasEmployment = faculty.wmsuId || faculty.employeeId;

  return (
    <div className="space-y-5">
      {hasContact && (
        <InfoSection title="Contact" icon="contact_mail">
          {faculty.email && (
            <InfoRow
              label="Email"
              icon="mail"
              value={faculty.email}
              href={`mailto:${faculty.email}`}
              onCopy={() => onCopy('email', faculty.email!)}
              copied={copiedKey === 'email'}
            />
          )}
          {faculty.contact && (
            <InfoRow
              label="Phone"
              icon="call"
              value={faculty.contact}
              href={`tel:${faculty.contact}`}
              onCopy={() => onCopy('contact', faculty.contact!)}
              copied={copiedKey === 'contact'}
            />
          )}
        </InfoSection>
      )}

      {hasEmployment && (
        <InfoSection title="Employment" icon="work">
          {faculty.wmsuId && (
            <InfoRow
              label="WMSU ID"
              icon="badge"
              value={faculty.wmsuId}
              mono
              onCopy={() => onCopy('wmsuId', faculty.wmsuId!)}
              copied={copiedKey === 'wmsuId'}
            />
          )}
          {faculty.employeeId && (
            <InfoRow
              label="Employee ID"
              icon="fingerprint"
              value={faculty.employeeId}
              mono
              onCopy={() => onCopy('employeeId', faculty.employeeId!)}
              copied={copiedKey === 'employeeId'}
            />
          )}
        </InfoSection>
      )}

      <InfoSection title="Assignment" icon="assignment_ind">
        <InfoRow
          label="Department"
          icon="apartment"
          value={departmentLabel(faculty.deptId)}
        />
        <InfoRow
          label="Designation"
          icon="workspace_premium"
          value={designationLabel(faculty.designationId)}
        />
        <InfoRow
          label="Required Hours"
          icon="schedule"
          value={
            faculty.requiredHours != null
              ? `${faculty.requiredHours} hours/week`
              : '18 hours/week (default)'
          }
        />
      </InfoSection>
    </div>
  );
}

// ── Tab: Records ──

function RecordsTab({
  status,
  configuredCount,
  isForeign,
  onOpenQualifications,
  onOpenPreferences,
  onOpenUnavailability,
}: {
  status?: StatusInfo;
  configuredCount: number;
  isForeign: boolean;
  onOpenQualifications: () => void;
  onOpenPreferences: () => void;
  onOpenUnavailability: () => void;
}) {
  const TOTAL = 3;
  const complete = configuredCount === TOTAL;

  const radius = 16;
  const stroke = 4;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - configuredCount / TOTAL);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-surface-variant bg-surface-container-low px-3 py-3 flex items-center gap-3">
        <div className="relative w-10 h-10 shrink-0">
          <svg
            viewBox="0 0 40 40"
            className="w-full h-full -rotate-90"
            aria-hidden="true"
          >
            <circle
              cx="20"
              cy="20"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              className="text-surface-container-high"
            />
            <circle
              cx="20"
              cy="20"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className={complete ? 'text-emerald-500' : 'text-primary'}
              style={{ transition: 'stroke-dashoffset 300ms ease' }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-on-surface">
            {configuredCount}
            <span className="text-on-surface-variant font-normal">
              /{TOTAL}
            </span>
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-on-surface">
            {complete
              ? 'All record types configured'
              : `${TOTAL - configuredCount} record type${
                  TOTAL - configuredCount === 1 ? '' : 's'
                } missing`}
          </p>
          <p className="text-[11px] text-on-surface-variant mt-0.5">
            Feeds scheduling rules{' '}
            <strong className="font-semibold text-on-surface">F-5</strong>,{' '}
            <strong className="font-semibold text-on-surface">F-7</strong>, and{' '}
            <strong className="font-semibold text-on-surface">H-14</strong>.
          </p>
        </div>
      </div>

      <RecordCard
        label="Qualifications"
        description="Subjects this faculty is qualified to teach (rule F-5)."
        icon="school"
        count={status?.qualificationCount ?? 0}
        present={!!status?.hasQualifications}
        tone="emerald"
        onClick={isForeign ? undefined : onOpenQualifications}
      />
      <RecordCard
        label="Preferences"
        description="Soft preferred teaching windows (rule F-7)."
        icon="event_available"
        count={status?.preferenceCount ?? 0}
        present={!!status?.hasPreferences}
        tone="blue"
        onClick={isForeign ? undefined : onOpenPreferences}
      />
      <RecordCard
        label="Unavailability"
        description="Hard blocks that reject scheduling (rule H-14)."
        icon="block"
        count={status?.unavailabilityCount ?? 0}
        present={!!status?.hasUnavailability}
        tone="rose"
        onClick={isForeign ? undefined : onOpenUnavailability}
      />

      {isForeign && (
        <p className="text-[11px] text-on-surface-variant italic flex items-center gap-1.5 pt-1">
          <Icon name="lock" size={12} />
          Read-only — records belong to another department.
        </p>
      )}
    </div>
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
  children: React.ReactNode;
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

function RecordCard({
  label,
  description,
  icon,
  count,
  present,
  tone,
  onClick,
}: {
  label: string;
  description: string;
  icon: string;
  count: number;
  present: boolean;
  tone: 'emerald' | 'blue' | 'rose';
  onClick?: () => void;
}) {
  const accent = {
    emerald: present
      ? 'text-emerald-500 bg-emerald-500/10'
      : 'text-slate-500 bg-slate-500/10',
    blue: present
      ? 'text-blue-500 bg-blue-500/10'
      : 'text-slate-500 bg-slate-500/10',
    rose: present
      ? 'text-rose-500 bg-rose-500/10'
      : 'text-slate-500 bg-slate-500/10',
  }[tone];

  const Comp = onClick ? 'button' : 'div';

  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      disabled={!onClick}
      className={`w-full text-left rounded-lg border p-3 flex items-start gap-3 bg-surface-container-lowest transition ${
        onClick
          ? 'border-surface-variant hover:border-primary/50 hover:bg-surface-container-low cursor-pointer group'
          : 'border-surface-variant cursor-default opacity-75'
      }`}
    >
      <span
        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${accent}`}
      >
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p
            className={`text-sm font-semibold text-on-surface ${
              onClick ? 'group-hover:text-primary transition-colors' : ''
            }`}
          >
            {label}
          </p>
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
              present
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                : 'bg-surface-container-high text-on-surface-variant border-surface-variant'
            }`}
          >
            {present ? `${count} on file` : 'None'}
          </span>
        </div>
        <p className="text-[11px] text-on-surface-variant mt-0.5">
          {description}
        </p>

        {onClick && (
          <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary/80 group-hover:text-primary">
            Manage{' '}
            <Icon
              name="chevron_right"
              size={12}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </div>
        )}
      </div>
    </Comp>
  );
}