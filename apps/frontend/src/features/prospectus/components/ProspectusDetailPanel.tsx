import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../../components/ui/Icon';
import { ActiveBadge } from '../../../components/ui/StatusBadge';
import { isAnyModalOpen } from '../../../components/ui/Modal';
import type { ProspectusRecord } from '../../../api/prospectus.api';
import type { SubjectRecord } from '../../../api/subjects.api';

type Tab = 'overview' | 'schedule';

interface Props {
  open: boolean;
  onClose: () => void;
  entry: ProspectusRecord | null;
  subject: SubjectRecord | undefined;
  semesterLabel: string;
  isPlaceholder: boolean;
  isMinor: boolean;
  canWrite: boolean;
  togglePending?: boolean;
  onEditPlacement: () => void;
  onEditSubject: () => void;
  onFillSlot: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}

const ROOM_TYPE_META: Record<string, { icon: string; label: string }> = {
  any: { icon: 'swap_horiz', label: 'Any' },
  lecture_room: { icon: 'meeting_room', label: 'Lecture Room' },
  laboratory: { icon: 'science', label: 'Laboratory' },
  computer_lab: { icon: 'computer', label: 'Computer Lab' },
  drafting_room: { icon: 'draw', label: 'Drafting Room' },
  other: { icon: 'category', label: 'Other' },
};

function ordinal(n: number): string {
  const r10 = n % 10;
  const r100 = n % 100;
  if (r100 >= 11 && r100 <= 13) return 'th';
  if (r10 === 1) return 'st';
  if (r10 === 2) return 'nd';
  if (r10 === 3) return 'rd';
  return 'th';
}

export default function ProspectusDetailPanel({
  open,
  onClose,
  entry,
  subject,
  semesterLabel,
  isPlaceholder,
  isMinor,
  canWrite,
  togglePending = false,
  onEditPlacement,
  onEditSubject,
  onFillSlot,
  onToggleActive,
  onDelete,
}: Props) {
  const [tab, setTab] = useState<Tab>('overview');

  // A mapping can't be activated while its subject is inactive.
  const subjectInactive = !!subject && subject.isActive === false;

  // Reset tab when a different entry opens.
  useEffect(() => {
    if (open) setTab('overview');
  }, [entry?.prospectusId, open]);

  // Escape closes — unless a modal above us owns the keystroke.
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

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!entry) return null;
  if (typeof document === 'undefined') return null;

  const code = entry.subject?.subjectCode ?? subject?.subjectCode ?? '—';
  const title = entry.subject?.title ?? subject?.title ?? '—';
  const lecUnits = Number(subject?.lectureUnits ?? entry.subject?.lectureUnits ?? 0);
  const labUnits = Number(subject?.labUnits ?? entry.subject?.labUnits ?? 0);
  const totalUnits = Number(subject?.totalUnits ?? entry.subject?.totalUnits ?? 0);
  const roomType = subject?.requiredRoomType ?? null;

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
        aria-label={`Prospectus entry: ${code}`}
        className={`fixed top-0 right-0 z-[110] h-screen w-full max-w-md bg-surface-container-lowest text-on-surface shadow-2xl flex flex-col transition-transform duration-200 ease-out border-l border-surface-variant ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-4 border-b border-surface-variant shrink-0">
          <span className="w-12 h-12 rounded-lg bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 border border-primary/30 font-mono text-center leading-tight px-1 break-all">
            {code}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-on-surface text-base truncate">{title}</p>
            <p className="text-xs text-on-surface-variant mt-0.5 truncate font-mono">{code}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <ActiveBadge isActive={entry.isActive} />
              {isMinor && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-500/15 text-purple-600 border border-purple-500/30">
                  <Icon name="school" size={10} />
                  Minor
                </span>
              )}
              {isPlaceholder && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 border border-amber-500/30">
                  <Icon name="warning" size={10} />
                  Needs Course
                </span>
              )}
              {!canWrite && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-500 border border-amber-500/30"
                  title="Read-only — you don't have write access to this program"
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
              { key: 'overview', label: 'Overview', icon: 'info' },
              { key: 'schedule', label: 'Schedule', icon: 'schedule' },
            ] as { key: Tab; label: string; icon: string }[]
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
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {tab === 'overview' && (
            <>
              <InfoSection title="Placement" icon="place">
                <InfoRow
                  label="Program"
                  icon="school"
                  value={
                    entry.program
                      ? `[${entry.program.programCode}] ${entry.program.programName}`
                      : '—'
                  }
                />
                <InfoRow
                  label="Year"
                  icon="calendar_today"
                  value={`${entry.yearLevel}${ordinal(entry.yearLevel)} Year`}
                />
                <InfoRow label="Semester" icon="event" value={semesterLabel} />
              </InfoSection>

              <InfoSection title="Subject" icon="menu_book">
                <InfoRow label="Code" icon="tag" value={code} mono />
                <InfoRow label="Title" icon="title" value={title} />
                <div className="flex items-center gap-2">
                  <Icon name="functions" size={14} className="text-on-surface-variant shrink-0" />
                  <span className="text-xs text-on-surface-variant w-24 shrink-0">Units</span>
                  <div className="flex items-center gap-1 flex-1">
                    {lecUnits > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-500/15 text-blue-600">
                        {lecUnits}L
                      </span>
                    )}
                    {labUnits > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-600">
                        {labUnits}Lab
                      </span>
                    )}
                    {(lecUnits > 0 || labUnits > 0) && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-surface-container-high text-on-surface-variant">
                        = {totalUnits}
                      </span>
                    )}
                    {lecUnits === 0 && labUnits === 0 && (
                      <span className="text-xs text-rose-500 font-medium">No units set</span>
                    )}
                  </div>
                </div>
                <InfoRow
                  label="Room Type"
                  icon={roomType ? ROOM_TYPE_META[roomType]?.icon ?? 'category' : 'category'}
                  value={
                    roomType
                      ? ROOM_TYPE_META[roomType]?.label ?? roomType
                      : 'Not specified'
                  }
                />
              </InfoSection>
            </>
          )}

          {tab === 'schedule' && <ScheduleTab entry={entry} />}
        </div>

        {/* Footer actions */}
        <div className="p-3 border-t border-surface-variant bg-surface-container-low flex flex-wrap items-center gap-2 shrink-0">
          {canWrite ? (
            <>
              {isPlaceholder ? (
                <button
                  type="button"
                  onClick={onFillSlot}
                  className="px-3 py-2 text-xs font-semibold bg-primary text-on-primary hover:opacity-90 transition rounded-lg flex items-center gap-1.5"
                >
                  <Icon name="add_circle" size={14} />
                  Fill Slot
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onEditSubject}
                  className="px-3 py-2 text-xs font-semibold border border-primary/30 text-primary hover:bg-primary/5 transition rounded-lg flex items-center gap-1.5"
                  title="Go to Subjects page to edit code, title, units, etc."
                >
                  <Icon name="open_in_new" size={14} />
                  Edit Subject
                </button>
              )}
              <button
                type="button"
                onClick={onToggleActive}
                disabled={togglePending || (!entry.isActive && subjectInactive)}
                title={
                  !entry.isActive && subjectInactive
                    ? 'Subject is inactive — reactivate it on the Subjects page first.'
                    : undefined
                }
                className="px-3 py-2 text-xs font-semibold border border-surface-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-high transition rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Icon name={entry.isActive ? 'toggle_off' : 'toggle_on'} size={14} />
                {entry.isActive
                  ? 'Deactivate'
                  : subjectInactive
                  ? 'Activate (subject inactive)'
                  : 'Activate'}
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
                onClick={onEditPlacement}
                className="px-4 py-2 text-xs font-semibold bg-primary text-on-primary hover:opacity-90 transition rounded-lg flex items-center gap-1.5"
              >
                <Icon name="edit" size={14} />
                Edit Placement
              </button>
            </>
          ) : (
            <p className="text-[11px] text-on-surface-variant italic flex items-center gap-1.5">
              <Icon name="lock" size={12} />
              Read-only — you don't have write access to this program.
            </p>
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}

// ── Tab: Schedule ──

function ScheduleTab({ entry }: { entry: ProspectusRecord }) {
  const hasLecture = (entry.subject?.lectureUnits ?? 0) > 0;
  const hasLab = (entry.subject?.labUnits ?? 0) > 0;
  const lecSessions = entry.lectureSessionsPerWeek ?? 1;
  const lecMinutes = entry.lectureMinutesPerSession ?? 90;
  const labSessions = entry.labSessionsPerWeek ?? 1;
  const labMinutes = entry.labMinutesPerSession ?? 180;
  const lecHours = (lecSessions * lecMinutes) / 60;
  const labHours = (labSessions * labMinutes) / 60;
  const totalHours = (hasLecture ? lecHours : 0) + (hasLab ? labHours : 0);
  const noPattern = !hasLecture && !hasLab;

  if (noPattern) {
    return (
      <div className="rounded-lg p-3 text-xs bg-amber-50 text-amber-900 border border-amber-200 flex items-start gap-2">
        <Icon name="warning" size={14} className="shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">No units defined</p>
          <p className="mt-0.5">
            This subject has 0 lecture and 0 lab units. Set them on the Subjects
            page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center gap-3">
        <Icon name="summarize" size={20} className="text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-on-surface-variant">Total weekly contact</p>
          <p className="text-lg font-bold text-primary font-mono">
            {totalHours.toFixed(1)} hours
          </p>
        </div>
        {totalHours > 6 && (
          <span className="text-[10px] font-semibold text-amber-600 flex items-center gap-1">
            <Icon name="warning" size={11} />
            High load
          </span>
        )}
      </div>

      {hasLecture && (
        <PatternCard
          variant="lecture"
          label="Lecture"
          icon="meeting_room"
          sessions={lecSessions}
          minutes={lecMinutes}
          hours={lecHours}
          units={Number(entry.subject?.lectureUnits ?? 0)}
        />
      )}
      {hasLab && (
        <PatternCard
          variant="lab"
          label="Laboratory"
          icon="science"
          sessions={labSessions}
          minutes={labMinutes}
          hours={labHours}
          units={Number(entry.subject?.labUnits ?? 0)}
        />
      )}
    </div>
  );
}

function PatternCard({
  variant,
  label,
  icon,
  sessions,
  minutes,
  hours,
  units,
}: {
  variant: 'lecture' | 'lab';
  label: string;
  icon: string;
  sessions: number;
  minutes: number;
  hours: number;
  units: number;
}) {
  const tone =
    variant === 'lecture'
      ? {
          bg: 'bg-blue-500/5',
          border: 'border-blue-500/20',
          text: 'text-blue-600',
          badge: 'bg-blue-500/15 text-blue-600',
        }
      : {
          bg: 'bg-amber-500/5',
          border: 'border-amber-500/20',
          text: 'text-amber-600',
          badge: 'bg-amber-500/15 text-amber-600',
        };

  return (
    <div className={`rounded-lg border ${tone.border} ${tone.bg} p-3`}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon name={icon} size={14} className={tone.text} />
        <span className={`text-xs font-bold uppercase tracking-wider ${tone.text}`}>
          {label}
        </span>
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${tone.badge} ml-auto`}>
          {units} units
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-on-surface-variant">Sessions / week</p>
          <p className="font-mono font-semibold text-on-surface">{sessions}</p>
        </div>
        <div>
          <p className="text-on-surface-variant">Minutes / session</p>
          <p className="font-mono font-semibold text-on-surface">{minutes}</p>
        </div>
      </div>
      <div
        className={`mt-2 pt-2 border-t ${tone.border} text-[11px] ${tone.text} font-mono font-semibold`}
      >
        {hours.toFixed(1)} hours/week
      </div>
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
      <span className="text-xs text-on-surface-variant w-24 shrink-0">{label}</span>
      <span
        className={`text-sm text-on-surface truncate flex-1 ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}