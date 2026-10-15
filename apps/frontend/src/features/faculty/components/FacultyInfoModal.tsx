import { useMemo, useState } from 'react';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import StatusBadge, { ActiveBadge } from '../../../components/ui/StatusBadge';
import type { FacultyRecord, FacultyClass } from '../../../api/faculty.api';
import type { Department } from '../../../api/departments.api';

const CLASS_TONE: Record<FacultyClass, 'info' | 'warning' | 'purple' | 'neutral'> = {
  regular: 'info',
  part_time: 'warning',
  visiting_lecturer: 'purple',
  other: 'neutral',
};

interface Props {
  open: boolean;
  onClose: () => void;
  faculty: FacultyRecord | null;
  /** Lookup maps for display */
  departmentLabel: (id: string | null) => string;
  designationLabel: (id: string | null) => string;
  /** Status summary for the faculty (qualifications/preferences/unavailability) */
  status?: {
    hasQualifications: boolean;
    hasPreferences: boolean;
    hasUnavailability: boolean;
    qualificationCount?: number;
    preferenceCount?: number;
    unavailabilityCount?: number;
  };
  /** Read-only when faculty belongs to another department */
  isForeign?: boolean;
  /** Quick action handlers */
  onEdit: () => void;
  onOpenQualifications: () => void;
  onOpenPreferences: () => void;
  onOpenUnavailability: () => void;
  onToggleActive: () => void;
  togglePending?: boolean;
}

export default function FacultyInfoModal({
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
  togglePending = false,
}: Props) {
  // Copy-to-clipboard feedback
  const [copiedKey, setCopiedKey] = useMemoState<string | null>(null);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {
      /* clipboard may be blocked — silent fail */
    }
  };

  if (!faculty) return null;

  const fullName = `${faculty.lastName}, ${faculty.firstName}`;
  const initials =
    `${faculty.firstName[0] ?? ''}${faculty.lastName[0] ?? ''}`.toUpperCase();

  const hasContact = faculty.email || faculty.contact;
  const hasEmployment = faculty.wmsuId || faculty.employeeId;
  const hasRecords =
    status?.hasQualifications ||
    status?.hasPreferences ||
    status?.hasUnavailability;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Faculty Details"
      description={fullName}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
          >
            Close
          </button>
          {!isForeign && (
            <>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onToggleActive();
                }}
                disabled={togglePending}
                className="px-4 py-2 text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition rounded-lg disabled:opacity-50 flex items-center gap-2"
              >
                <Icon
                  name={faculty.isActive ? 'toggle_off' : 'toggle_on'}
                  size={16}
                />
                {faculty.isActive ? 'Deactivate' : 'Activate'}
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit();
                }}
                className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition rounded-lg flex items-center gap-2"
              >
                <Icon name="edit" size={16} />
                Edit
              </button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {/* ── Header: avatar + name + status ── */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
          <span className="w-12 h-12 rounded-full bg-primary text-on-primary text-base font-bold flex items-center justify-center shrink-0">
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
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800"
                  title="Read-only — belongs to another department"
                >
                  <Icon name="lock" size={10} />
                  Read only
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Contact ── */}
        {hasContact && (
          <InfoSection title="Contact" icon="contact_mail">
            {faculty.email && (
              <InfoRow
                label="Email"
                icon="mail"
                value={faculty.email}
                href={`mailto:${faculty.email}`}
                onCopy={() => copy('email', faculty.email!)}
                copied={copiedKey === 'email'}
              />
            )}
            {faculty.contact && (
              <InfoRow
                label="Phone"
                icon="call"
                value={faculty.contact}
                href={`tel:${faculty.contact}`}
                onCopy={() => copy('contact', faculty.contact!)}
                copied={copiedKey === 'contact'}
              />
            )}
          </InfoSection>
        )}

        {/* ── Employment ── */}
        {hasEmployment && (
          <InfoSection title="Employment" icon="work">
            {faculty.wmsuId && (
              <InfoRow
                label="WMSU ID"
                icon="badge"
                value={faculty.wmsuId}
                mono
                onCopy={() => copy('wmsuId', faculty.wmsuId!)}
                copied={copiedKey === 'wmsuId'}
              />
            )}
            {faculty.employeeId && (
              <InfoRow
                label="Employee ID"
                icon="fingerprint"
                value={faculty.employeeId}
                mono
                onCopy={() => copy('employeeId', faculty.employeeId!)}
                copied={copiedKey === 'employeeId'}
              />
            )}
          </InfoSection>
        )}

        {/* ── Assignment ── */}
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

        {/* ── Records summary ── */}
        <InfoSection title="Records" icon="folder">
          <RecordRow
            label="Qualifications"
            icon="school"
            count={status?.qualificationCount ?? 0}
            present={!!status?.hasQualifications}
            tone="emerald"
            onClick={
              isForeign ? undefined : onOpenQualifications
            }
          />
          <RecordRow
            label="Preferences"
            icon="event_available"
            count={status?.preferenceCount ?? 0}
            present={!!status?.hasPreferences}
            tone="blue"
            onClick={isForeign ? undefined : onOpenPreferences}
          />
          <RecordRow
            label="Unavailability"
            icon="block"
            count={status?.unavailabilityCount ?? 0}
            present={!!status?.hasUnavailability}
            tone="rose"
            onClick={isForeign ? undefined : onOpenUnavailability}
          />
          {!hasRecords && (
            <p className="text-[11px] text-slate-400 italic pt-2">
              No records configured yet. Use the buttons below to add them.
            </p>
          )}
        </InfoSection>

        {/* ── Quick action buttons ── */}
        {!isForeign && (
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200">
            <QuickAction
              icon="school"
              label="Qualifications"
              onClick={() => {
                onClose();
                onOpenQualifications();
              }}
            />
            <QuickAction
              icon="event_available"
              label="Preferences"
              onClick={() => {
                onClose();
                onOpenPreferences();
              }}
            />
            <QuickAction
              icon="block"
              label="Unavailability"
              onClick={() => {
                onClose();
                onOpenUnavailability();
              }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Local helpers ──

// Small hook: copy state with auto-reset
function useMemoState<T>(initial: T): [T, (v: T | ((p: T) => T)) => void] {
  // Using React's useState under a clearer name
  const [v, setV] = useState(initial);
  return [v, setV];
}

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
        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          {title}
        </h3>
        <div className="flex-1 h-px bg-slate-200" />
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
      <Icon name={icon} size={14} className="text-slate-400 shrink-0" />
      <span className="text-xs text-slate-500 w-24 shrink-0">{label}</span>
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
          className="opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"
          title="Copy"
          aria-label={`Copy ${label}`}
        >
          <Icon name={copied ? 'check' : 'content_copy'} size={12} />
        </button>
      )}
    </div>
  );
}

function RecordRow({
  label,
  icon,
  count,
  present,
  tone,
  onClick,
}: {
  label: string;
  icon: string;
  count: number;
  present: boolean;
  tone: 'emerald' | 'blue' | 'rose';
  onClick?: () => void;
}) {
  const toneClasses = {
    emerald: present
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : 'text-slate-500 bg-slate-50 border-slate-200',
    blue: present
      ? 'text-blue-700 bg-blue-50 border-blue-200'
      : 'text-slate-500 bg-slate-50 border-slate-200',
    rose: present
      ? 'text-rose-700 bg-rose-50 border-rose-200'
      : 'text-slate-500 bg-slate-50 border-slate-200',
  }[tone];

  const Comp = onClick ? 'button' : 'div';

  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left transition ${toneClasses} ${
        onClick ? 'hover:shadow-sm cursor-pointer' : ''
      }`}
    >
      <Icon name={icon} size={14} />
      <span className="text-xs font-semibold flex-1">{label}</span>
      {present ? (
        <span className="text-xs font-bold">{count}</span>
      ) : (
        <span className="text-[10px] uppercase tracking-wider opacity-70">
          None
        </span>
      )}
      {onClick && (
        <Icon name="chevron_right" size={14} className="opacity-50" />
      )}
    </Comp>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 px-2 py-3 rounded-lg border border-slate-200 hover:border-primary hover:bg-primary/5 transition text-center"
    >
      <Icon name={icon} size={18} className="text-primary" />
      <span className="text-[10px] font-semibold text-slate-700 leading-tight">
        {label}
      </span>
    </button>
  );
}