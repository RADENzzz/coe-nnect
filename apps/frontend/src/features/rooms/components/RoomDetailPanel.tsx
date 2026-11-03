import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import Icon from '../../../components/ui/Icon';
import StatusBadge, { ActiveBadge } from '../../../components/ui/StatusBadge';
import { isAnyModalOpen } from '../../../components/ui/Modal';
import { useAuthStore } from '../../../store/auth.store';
import {
  fetchRoomPreferences,
  type RoomRecord,
  type RoomType,
} from '../../../api/rooms.api';

const TYPE_ICON: Record<RoomType, string> = {
  lecture_room: 'meeting_room',
  laboratory: 'science',
  computer_lab: 'computer',
  drafting_room: 'draw',
  other: 'category',
};

const TYPE_TONE: Record<
  RoomType,
  'info' | 'warning' | 'purple' | 'success' | 'neutral'
> = {
  lecture_room: 'info',
  laboratory: 'warning',
  computer_lab: 'purple',
  drafting_room: 'success',
  other: 'neutral',
};

const TYPE_ACCENT: Record<RoomType, string> = {
  lecture_room: 'from-blue-500/20 to-blue-500/5 text-blue-600 border-blue-500/20',
  laboratory:
    'from-amber-500/20 to-amber-500/5 text-amber-600 border-amber-500/20',
  computer_lab:
    'from-purple-500/20 to-purple-500/5 text-purple-600 border-purple-500/20',
  drafting_room:
    'from-emerald-500/20 to-emerald-500/5 text-emerald-600 border-emerald-500/20',
  other: 'from-slate-500/20 to-slate-500/5 text-slate-600 border-slate-500/20',
};

interface Props {
  open: boolean;
  onClose: () => void;
  room: RoomRecord | null;
  departmentLabel: (id: string | null) => string | null;
  isForeign?: boolean;
  canManagePreferences?: boolean;
  onEdit: () => void;
  onOpenPreferences: () => void;
  onToggleActive: () => void;
  onDelete?: () => void;
  togglePending?: boolean;
}

type Tab = 'overview' | 'preferences';

export default function RoomDetailPanel({
  open,
  onClose,
  room,
  departmentLabel,
  isForeign = false,
  canManagePreferences = false,
  onEdit,
  onOpenPreferences,
  onToggleActive,
  onDelete,
  togglePending = false,
}: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const isShared = !!room && !room.deptId;

  // Fetch preferences for the room (only if shared — the endpoint is
  // harmless on owned rooms, but no reason to call it).
  const { data: preferences = [], isLoading: prefsLoading } = useQuery({
    queryKey: ['room-preferences', room?.roomId],
    queryFn: () => fetchRoomPreferences(room!.roomId),
    enabled: open && !!room?.roomId && isShared,
    staleTime: 30_000,
  });

  // Reset tab when a different room opens
  useEffect(() => {
    if (open) setTab('overview');
  }, [room?.roomId, open]);

  // Close on Escape — defer to any modal above us
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
      /* clipboard blocked */
    }
  };

  if (!room) return null;
  if (typeof document === 'undefined') return null;

  const prefsCount = preferences.length;
  const sharedPrefsBadge = isShared ? prefsCount : undefined;

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
        aria-label={`Room details: ${room.roomNumber}`}
        className={`fixed top-0 right-0 z-[110] h-screen w-full max-w-md bg-surface-container-lowest text-on-surface shadow-2xl flex flex-col transition-transform duration-200 ease-out border-l border-surface-variant ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* ── Header ── */}
        <div className="p-4 border-b border-surface-variant shrink-0">
          <div className="flex items-start gap-3">
            <div
              className={`w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center shrink-0 border ${TYPE_ACCENT[room.roomType]}`}
            >
              <Icon name={TYPE_ICON[room.roomType]} size={24} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 group">
                <p className="font-mono font-bold text-on-surface text-lg leading-tight">
                  Room {room.roomNumber}
                </p>
                <button
                  type="button"
                  onClick={() => copy('roomNumber', room.roomNumber)}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition p-1 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface"
                  title="Copy room number"
                  aria-label="Copy room number"
                >
                  <Icon
                    name={copiedKey === 'roomNumber' ? 'check' : 'content_copy'}
                    size={12}
                  />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <span className="text-xs text-on-surface-variant">
                  {room.building}
                </span>
                <StatusBadge tone={TYPE_TONE[room.roomType]}>
                  {room.roomType.replace('_', ' ')}
                </StatusBadge>
                <ActiveBadge isActive={room.isActive} />
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
              className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition shrink-0"
              aria-label="Close panel"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b border-surface-variant px-2 shrink-0">
          {(
            [
              { key: 'overview', label: 'Overview', icon: 'info' },
              {
                key: 'preferences',
                label: 'Preferences',
                icon: 'star',
                badge: sharedPrefsBadge,
              },
            ] as {
              key: Tab;
              label: string;
              icon: string;
              badge?: number;
            }[]
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
              {t.badge != null && t.badge > 0 && (
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

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {tab === 'overview' && (
            <OverviewTab
              room={room}
              departmentLabel={departmentLabel}
              copiedKey={copiedKey}
              onCopy={copy}
            />
          )}

          {tab === 'preferences' && (
            <PreferencesTab
              room={room}
              preferences={preferences}
              isLoading={prefsLoading}
              isForeign={isForeign}
              canManagePreferences={canManagePreferences}
              onOpenPreferences={onOpenPreferences}
            />
          )}
        </div>

        {/* ── Footer ── */}
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
                  name={room.isActive ? 'toggle_off' : 'toggle_on'}
                  size={14}
                />
                {room.isActive ? 'Deactivate' : 'Activate'}
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
                Edit
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

// ────────────────────────────────────────────
// Tab: Overview
// ────────────────────────────────────────────

function OverviewTab({
  room,
  departmentLabel,
  copiedKey,
  onCopy,
}: {
  room: RoomRecord;
  departmentLabel: (id: string | null) => string | null;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => void;
}) {
  const isShared = !room.deptId;
  const ownerName = room.deptId ? departmentLabel(room.deptId) : null;
  const typeLabel = room.roomType.replace('_', ' ');

  return (
    <div className="space-y-5">
      {/* Quick fact cards */}
      <div className="grid grid-cols-2 gap-2">
        <FactCard
          icon="groups"
          label="Capacity"
          value={room.capacity != null ? String(room.capacity) : '—'}
          hint={room.capacity != null ? 'seats' : 'not set'}
          tone={room.capacity != null ? 'default' : 'muted'}
        />
        <FactCard
          icon={isShared ? 'groups' : 'business'}
          label="Ownership"
          value={isShared ? 'Shared' : 'Owned'}
          hint={isShared ? 'all departments' : ownerName ?? '—'}
          tone={isShared ? 'blue' : 'default'}
        />
      </div>

      <InfoSection title="Identification" icon="badge">
        <InfoRow
          label="Room no."
          icon="tag"
          value={room.roomNumber}
          mono
          onCopy={() => onCopy('roomNumber', room.roomNumber)}
          copied={copiedKey === 'roomNumber'}
        />
        <InfoRow
          label="Building"
          icon="apartment"
          value={room.building}
          onCopy={() => onCopy('building', room.building)}
          copied={copiedKey === 'building'}
        />
      </InfoSection>

      <InfoSection title="Room details" icon="tune">
        <InfoRow
          label="Type"
          icon={TYPE_ICON[room.roomType]}
          value={capitalize(typeLabel)}
        />
        <InfoRow
          label="Capacity"
          icon="groups"
          value={
            room.capacity != null ? `${room.capacity} seats` : 'Not specified'
          }
        />
      </InfoSection>

      <InfoSection title="Scheduling" icon="event">
        <InfoRow
          label="Status"
          icon={room.isActive ? 'check_circle' : 'block'}
          value={room.isActive ? 'Active' : 'Inactive'}
        />
        <InfoRow
          label="Auto-generate"
          icon="auto_awesome"
          value={
            room.isActive
              ? 'Eligible for assignment'
              : 'Excluded from assignment'
          }
        />
      </InfoSection>

      {isShared && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs">
          <Icon name="groups" size={14} className="shrink-0 mt-0.5" />
          <span>
            This is a <strong>shared</strong> room — any department head can
            manage it. Use the <strong>Preferences</strong> tab to see which
            departments favor it.
          </span>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────
// Tab: Preferences
// ────────────────────────────────────────────

function PreferencesTab({
  room,
  preferences,
  isLoading,
  isForeign,
  canManagePreferences,
  onOpenPreferences,
}: {
  room: RoomRecord;
  preferences: import('../../../api/rooms.api').RoomPreferenceRecord[];
  isLoading: boolean;
  isForeign: boolean;
  canManagePreferences: boolean;
  onOpenPreferences: () => void;
}) {
  const profile = useAuthStore((s) => s.profile);
  const myDeptId = profile?.dept_id != null ? String(profile.dept_id) : null;

  // Owned rooms can't be preferred — short-circuit
  if (room.deptId) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 flex items-start gap-3 text-xs text-amber-900">
        <Icon name="info" size={16} className="shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Owned rooms can't be preferred</p>
          <p className="mt-1 leading-relaxed">
            Only shared rooms can be favored by departments. This room belongs
            to a single department, so auto-generate always treats it as
            exclusive to them.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Guidance */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex items-start gap-2.5 text-xs text-blue-900">
        <Icon name="star" size={14} className="shrink-0 mt-0.5 text-amber-500" />
        <p className="leading-relaxed">
          <strong>Preferred rooms influence auto-generate.</strong> When
          scheduling for a department, the solver favors shared rooms that
          department has preferred. Higher priority = stronger nudge.
        </p>
      </div>

      {/* List */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
            Departments that prefer this room
          </span>
          <span className="text-xs text-on-surface-variant">
            {preferences.length}
          </span>
        </div>

        {isLoading && (
          <div className="text-center py-4 text-xs text-on-surface-variant">
            Loading…
          </div>
        )}

        {!isLoading && preferences.length === 0 && (
          <div className="text-center py-6 text-xs text-on-surface-variant border border-dashed border-surface-variant rounded-lg">
            No department prefers this room yet.
          </div>
        )}

        {!isLoading && preferences.length > 0 && (
          <ul className="divide-y divide-surface-variant border border-surface-variant rounded-lg overflow-hidden">
            {preferences.map((p) => {
              const isMine = String(p.deptId) === myDeptId;
              return (
                <li
                  key={p.preferenceId}
                  className={`px-3 py-2.5 flex items-center gap-3 ${
                    isMine ? 'bg-amber-50/60' : ''
                  }`}
                >
                  <span
                    className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                      isMine ? 'bg-amber-500' : 'bg-slate-300'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-on-surface">
                        [{p.deptCode}] {p.deptName}
                      </span>
                      {isMine && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                          Your dept
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant mt-0.5">
                      <StarRating value={p.priority} />
                      <span>·</span>
                      <span>{priorityLabel(p.priority)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* CTA */}
      {canManagePreferences && !isForeign && (
        <button
          type="button"
          onClick={onOpenPreferences}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
        >
          <Icon name="settings" size={16} />
          Manage preferences
        </button>
      )}

      {isForeign && (
        <p className="text-[11px] text-on-surface-variant italic flex items-center gap-1.5 pt-1">
          <Icon name="lock" size={12} />
          Read-only — preferences for another department.
        </p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────
// Local helpers
// ────────────────────────────────────────────

function FactCard({
  icon,
  label,
  value,
  hint,
  tone = 'default',
}: {
  icon: string;
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'muted' | 'blue';
}) {
  const styles = {
    default:
      'bg-surface-container-low border-surface-variant text-on-surface',
    muted: 'bg-surface-container-low border-surface-variant text-slate-400',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
  }[tone];

  return (
    <div className={`rounded-xl border p-3 ${styles}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
          {label}
        </span>
        <Icon name={icon} size={14} className="opacity-60" />
      </div>
      <p className="text-xl font-bold mt-1 leading-tight">{value}</p>
      {hint && <p className="text-[10px] opacity-70 mt-0.5">{hint}</p>}
    </div>
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
  onCopy,
  copied,
}: {
  label: string;
  icon: string;
  value: string;
  mono?: boolean;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 group">
      <Icon
        name={icon}
        size={14}
        className="text-on-surface-variant shrink-0"
      />
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

function StarRating({ value, size = 10 }: { value: number; size?: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`Priority ${value} of 3`}
    >
      {[1, 2, 3].map((i) => (
        <Icon
          key={i}
          name="star"
          size={size}
          className={i <= value ? 'text-amber-500' : 'text-slate-200'}
        />
      ))}
    </span>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function priorityLabel(n: number): string {
  if (n === 3) return 'reserved if possible';
  if (n === 2) return 'strongly preferred';
  return 'preferred';
}