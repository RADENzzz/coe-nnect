import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import Icon from '../../../components/ui/Icon';
import { ActiveBadge } from '../../../components/ui/StatusBadge';
import { isAnyModalOpen } from '../../../components/ui/Modal';
import {
  fetchSubjectRestrictions,
  type SubjectRecord,
  type SubjectRoomType,
  type SubjectRestriction,
} from '../../../api/subjects.api';

type Tab = 'details' | 'restrictions';

const ROOM_TYPE_META: Record<
  SubjectRoomType,
  { icon: string; label: string }
> = {
  any: { icon: 'swap_horiz', label: 'Any (mixed L + Lab)' },
  lecture_room: { icon: 'meeting_room', label: 'Lecture Room' },
  laboratory: { icon: 'science', label: 'Laboratory' },
  computer_lab: { icon: 'computer', label: 'Computer Lab' },
  drafting_room: { icon: 'draw', label: 'Drafting Room' },
  other: { icon: 'category', label: 'Other' },
};

interface Props {
  open: boolean;
  onClose: () => void;
  subject: SubjectRecord | null;
  /** Full catalog — used to resolve the *other* subject's code in restrictions. */
  subjects: SubjectRecord[];
  departmentLabel: (id: string | null) => string;
  isForeign: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  /** Click handler for a restriction target — allows jumping to the paired subject. */
  onOpenSubject?: (subjectId: string) => void;
  togglePending?: boolean;
}

export default function SubjectDetailPanel({
  open,
  onClose,
  subject,
  subjects,
  departmentLabel,
  isForeign,
  onEdit,
  onToggleActive,
  onDelete,
  onOpenSubject,
  togglePending = false,
}: Props) {
  const [tab, setTab] = useState<Tab>('details');
  const [copied, setCopied] = useState(false);

  // Reset tab on subject switch.
  useEffect(() => {
    if (open) setTab('details');
  }, [subject?.subjectId, open]);

  // Escape closes — unless a modal is above us.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isAnyModalOpen()) return;
      onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock body scroll.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Restrictions — shared cache with the RestrictionsPanel.
  const { data: allRestrictions = [] } = useQuery({
    queryKey: ['subject-restrictions'],
    queryFn: () => fetchSubjectRestrictions(),
    enabled: open && !!subject,
  });

  const restrictionsForSubject = useMemo(() => {
    if (!subject) return [];
    return allRestrictions.filter(
      (r) =>
        String(r.subjectId1) === String(subject.subjectId) ||
        String(r.subjectId2) === String(subject.subjectId),
    );
  }, [allRestrictions, subject]);

  const activeRestrictionCount = restrictionsForSubject.filter(
    (r) => r.isActive,
  ).length;

  const copyCode = async () => {
    if (!subject) return;
    try {
      await navigator.clipboard.writeText(subject.subjectCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  if (!subject || typeof document === 'undefined') return null;

  const code = subject.subjectCode;
  const lec = Number(subject.lectureUnits ?? 0);
  const lab = Number(subject.labUnits ?? 0);
  const total = Number(subject.totalUnits ?? 0);
  const roomType = subject.requiredRoomType as SubjectRoomType | null;
  const roomMeta = roomType ? ROOM_TYPE_META[roomType] : null;
  const isMixed = lec > 0 && lab > 0;

  return createPortal(
    <>
      <div
        className={`fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Subject details: ${code}`}
        className={`fixed top-0 right-0 z-[110] h-screen w-full max-w-md bg-surface-container-lowest text-on-surface shadow-2xl flex flex-col transition-transform duration-200 ease-out border-l border-surface-variant ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-4 border-b border-surface-variant shrink-0">
          <div className="relative shrink-0">
            <span className="w-16 h-16 rounded-xl bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center border border-primary/25 font-mono text-center leading-tight px-1.5 break-all">
              {code}
            </span>
            <button
              type="button"
              onClick={copyCode}
              title="Copy subject code"
              aria-label="Copy subject code"
              className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-surface-container-lowest border border-surface-variant shadow-sm flex items-center justify-center text-on-surface-variant hover:text-primary hover:border-primary/40 transition"
            >
              <Icon name={copied ? 'check' : 'content_copy'} size={12} />
            </button>
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-bold text-on-surface text-base leading-snug line-clamp-2">
              {subject.title}
            </p>
            <p className="text-xs text-on-surface-variant mt-1 font-mono truncate">
              {departmentLabel(subject.deptId)} · {total} unit
              {total === 1 ? '' : 's'}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <ActiveBadge isActive={subject.isActive} />
              {subject.isElective && (
                <Chip icon="stars" tone="teal" title="Elective subject">
                  Elective
                </Chip>
              )}
              {subject.isMinor && (
                <Chip icon="school" tone="purple">
                  Minor
                </Chip>
              )}
              {isMixed && (
                <Chip icon="merge_type" tone="blue">
                  Mixed
                </Chip>
              )}
              {subject.isPlaceholder && (
                <Chip icon="warning" tone="amber">
                  Placeholder
                </Chip>
              )}
              {isForeign && (
                <Chip
                  icon="lock"
                  tone="amber"
                  title="Read-only — belongs to another department"
                >
                  Read only
                </Chip>
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

        {/* Compact summary bar */}
        <div className="grid grid-cols-3 gap-px bg-surface-variant shrink-0 border-b border-surface-variant">
          <SummaryTile icon="functions" label="Units" value={String(total)} />
          <SummaryTile
            icon={roomMeta?.icon ?? 'category'}
            label="Room"
            value={roomMeta?.label ?? '—'}
            truncate
          />
          <SummaryTile
            icon="rule"
            label="Restr."
            value={String(activeRestrictionCount)}
          />
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          className="flex border-b border-surface-variant px-2 shrink-0"
        >
          {(
            [
              { key: 'details', label: 'Details', icon: 'info' },
              {
                key: 'restrictions',
                label: 'Restrictions',
                icon: 'rule',
                badge: activeRestrictionCount,
              },
            ] as { key: Tab; label: string; icon: string; badge?: number }[]
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition ${
                tab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Icon name={t.icon} size={14} />
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span
                  aria-live="polite"
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {tab === 'details' && (
            <>
              <InfoSection title="Identification" icon="badge">
                <InfoRow label="Code" icon="tag" value={code} mono />
                <InfoRow label="Title" icon="title" value={subject.title} />
                <InfoRow
                  label="Department"
                  icon="apartment"
                  value={departmentLabel(subject.deptId)}
                />
              </InfoSection>

              <InfoSection title="Units" icon="calculate">
                <div className="flex items-center gap-2">
                  <Icon
                    name="functions"
                    size={14}
                    className="text-on-surface-variant shrink-0"
                  />
                  <span className="text-xs text-on-surface-variant w-24 shrink-0">
                    Breakdown
                  </span>
                  <div className="flex items-center gap-1 flex-1 flex-wrap">
                    {subject.unitsMode === 'total_only' ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-purple-500/15 text-purple-600">
                        {total} Total (no lec/lab split)
                      </span>
                    ) : (
                      <>
                        {lec > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-500/15 text-blue-600">
                            {lec} Lecture
                          </span>
                        )}
                        {lab > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-600">
                            {lab} Lab
                          </span>
                        )}
                        {lec === 0 && lab === 0 && (
                          <span className="text-xs text-rose-500 font-medium">
                            No units set
                          </span>
                        )}
                        {(lec > 0 || lab > 0) && (
                          <>
                            <span className="text-on-surface-variant text-xs">=</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-surface-container-high text-on-surface">
                              {total} Total
                            </span>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </InfoSection>

              <InfoSection title="Room & Classification" icon="tune">
                <InfoRow
                  label="Room Type"
                  icon={roomMeta?.icon ?? 'category'}
                  value={roomMeta?.label ?? 'Not specified'}
                />
                <InfoRow
                  label="Minor"
                  icon="school"
                  value={subject.isMinor ? 'Yes — cross-department' : 'No'}
                />
                <InfoRow
                  label="Elective"
                  icon="stars"
                  value={subject.isElective ? 'Yes' : 'No'}
                />
                <InfoRow
                  label="Units mode"
                  icon="functions"
                  value={
                    subject.unitsMode === 'total_only'
                      ? 'Total units only'
                      : 'Lecture + lab'
                  }
                />
                <InfoRow
                  label="Placeholder"
                  icon="warning"
                  value={
                    subject.isPlaceholder ? 'Yes — needs a real course' : 'No'
                  }
                />
              </InfoSection>
            </>
          )}

          {tab === 'restrictions' && (
            <RestrictionsTab
              subject={subject}
              restrictions={restrictionsForSubject}
              subjects={subjects}
              onOpenSubject={onOpenSubject}
            />
          )}
        </div>

        {/* Footer */}
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
                  name={subject.isActive ? 'toggle_off' : 'toggle_on'}
                  size={14}
                />
                {subject.isActive ? 'Deactivate' : 'Activate'}
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="px-3 py-2 text-xs font-semibold border border-rose-500/30 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition rounded-lg flex items-center gap-1.5"
              >
                <Icon name="delete" size={14} />
                Delete
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={onEdit}
                className="px-4 py-2 text-xs font-semibold bg-primary text-on-primary hover:opacity-90 transition rounded-lg flex items-center gap-1.5"
              >
                <Icon name="edit" size={14} />
                Edit Subject
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
    document.body,
  );
}

// ── Restrictions tab ──

function RestrictionsTab({
  subject,
  restrictions,
  subjects,
  onOpenSubject,
}: {
  subject: SubjectRecord;
  restrictions: SubjectRestriction[];
  subjects: SubjectRecord[];
  onOpenSubject?: (subjectId: string) => void;
}) {
  const findSubject = (id: string) =>
    subjects.find((s) => String(s.subjectId) === String(id));

  if (restrictions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-surface-variant bg-surface-container-lowest px-4 py-10 text-center">
        <Icon name="rule" size={36} className="text-slate-300 mx-auto mb-2" />
        <p className="text-sm font-semibold text-on-surface">No restrictions</p>
        <p className="text-xs text-on-surface-variant mt-1">
          This subject isn't part of any S-11 pair.
        </p>
      </div>
    );
  }

  const active = restrictions.filter((r) => r.isActive);
  const inactive = restrictions.filter((r) => !r.isActive);

  return (
    <div className="space-y-3">
      <p className="text-xs text-on-surface-variant">
        Restricted against{' '}
        <strong className="text-on-surface">{active.length}</strong> active pair
        {active.length === 1 ? '' : 's'}
        {inactive.length > 0 && (
          <>
            {' '}· <strong className="text-on-surface">{inactive.length}</strong>{' '}
            inactive
          </>
        )}
        .
      </p>

      {active.length > 0 && (
        <section className="space-y-2">
          <SectionLabel>Active</SectionLabel>
          {active.map((r) => (
            <RestrictionRowCard
              key={r.restrictionId}
              restriction={r}
              currentId={subject.subjectId}
              findSubject={findSubject}
              onOpenSubject={onOpenSubject}
            />
          ))}
        </section>
      )}

      {inactive.length > 0 && (
        <section className="space-y-2">
          <SectionLabel>Inactive</SectionLabel>
          {inactive.map((r) => (
            <RestrictionRowCard
              key={r.restrictionId}
              restriction={r}
              currentId={subject.subjectId}
              findSubject={findSubject}
              onOpenSubject={onOpenSubject}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function RestrictionRowCard({
  restriction: r,
  currentId,
  findSubject,
  onOpenSubject,
}: {
  restriction: SubjectRestriction;
  currentId: string;
  findSubject: (id: string) => SubjectRecord | undefined;
  onOpenSubject?: (id: string) => void;
}) {
  const isA = String(r.subjectId1) === String(currentId);
  const otherId = isA ? r.subjectId2 : r.subjectId1;
  const other = findSubject(otherId);
  const otherLabel = other
    ? `[${other.subjectCode}] ${other.title}`
    : `#${otherId}`;
  const clickable = !!other && !!onOpenSubject;

  return (
    <button
      type="button"
      onClick={() => other && onOpenSubject?.(other.subjectId)}
      disabled={!clickable}
      className={`w-full text-left rounded-lg border p-3 text-xs space-y-1.5 transition ${
        r.isActive
          ? 'border-primary/20 bg-primary/5 hover:bg-primary/10'
          : 'border-surface-variant bg-surface-container-low opacity-70 hover:opacity-100'
      } ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-center gap-1.5">
        <Icon
          name="block"
          size={12}
          className={r.isActive ? 'text-primary' : 'text-slate-400'}
        />
        <span className="font-semibold text-on-surface truncate">
          {otherLabel}
        </span>
        {!r.isActive && <Chip tone="neutral">Inactive</Chip>}
        {clickable && (
          <Icon
            name="arrow_forward"
            size={11}
            className="text-on-surface-variant ml-auto"
          />
        )}
      </div>
      {r.warningMessage && (
        <p className="text-on-surface-variant leading-relaxed">
          {r.warningMessage}
        </p>
      )}
    </button>
  );
}

// ── Small building blocks ──

function Chip({
  icon,
  tone = 'neutral',
  title,
  children,
}: {
  icon?: string;
  tone?: 'purple' | 'blue' | 'amber' | 'teal' | 'neutral';
  title?: string;
  children: React.ReactNode;
}) {
  const tones = {
    purple: 'bg-purple-500/15 text-purple-600 border-purple-500/30',
    blue: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
    amber: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
    teal: 'bg-teal-500/15 text-teal-600 border-teal-500/30',
    neutral:
      'bg-surface-container-high text-on-surface-variant border-surface-variant',
  } as const;
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${tones[tone]}`}
    >
      {icon && <Icon name={icon} size={10} />}
      {children}
    </span>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  truncate,
}: {
  icon: string;
  label: string;
  value: string;
  truncate?: boolean;
}) {
  return (
    <div className="bg-surface-container-lowest px-3 py-2.5 flex items-center gap-2 min-w-0">
      <Icon name={icon} size={14} className="text-primary shrink-0" />
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">
          {label}
        </p>
        <p
          className={`text-xs font-semibold text-on-surface ${
            truncate ? 'truncate' : ''
          }`}
          title={value}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant pt-1">
      {children}
    </h4>
  );
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
  mono,
}: {
  label: string;
  icon: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon name={icon} size={14} className="text-on-surface-variant shrink-0" />
      <span className="text-xs text-on-surface-variant w-24 shrink-0">
        {label}
      </span>
      <span
        className={`text-sm text-on-surface truncate flex-1 ${
          mono ? 'font-mono' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}