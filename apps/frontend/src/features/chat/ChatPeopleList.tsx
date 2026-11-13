import { useMemo } from 'react';
import Icon from '../../components/ui/Icon';
import type { ChatUser, PresenceResolver } from './types';

const ROLE_LABELS: Record<string, string> = {
  administrator: 'Admin',
  college_dean: 'Dean',
  department_head: 'DH',
  college_secretary: 'Secretary',
  viewer: 'Viewer',
};

const ROLE_ORDER: Record<string, number> = {
  administrator: 0,
  college_dean: 1,
  department_head: 2,
  college_secretary: 3,
  viewer: 4,
};

function initials(username: string): string {
  if (!username) return '—';
  return username.slice(0, 2).toUpperCase();
}

interface Props {
  users: ChatUser[];
  presenceFor: PresenceResolver;
  onPick: (userId: string) => void;
  activeUserId: string | null;
  query?: string;
  startingUserId?: string | null;
}

function PersonRow({
  user,
  presenceFor,
  onPick,
  active,
  starting,
}: {
  user: ChatUser;
  presenceFor: PresenceResolver;
  onPick: (userId: string) => void;
  active: boolean;
  starting: boolean;
}) {
  const presence = presenceFor(user.userId, user.lastSeenAt);
  const role = ROLE_LABELS[user.role] ?? user.role;
  const dept = user.deptName
    ? `${user.deptCode ? `[${user.deptCode}] ` : ''}${user.deptName}`
    : 'College of Engineering';

  return (
    <button
      type="button"
      onClick={() => onPick(user.userId)}
      disabled={starting}
      className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors disabled:cursor-wait focus:outline-none focus-visible:bg-surface-container-low ${
        active ? 'bg-primary/5' : 'hover:bg-surface-container-low'
      }`}
    >
      <span className="relative shrink-0">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-high text-[10px] font-bold text-on-surface-variant">
          {initials(user.username)}
        </span>
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface ${
            presence.online ? 'bg-emerald-500' : 'bg-slate-400'
          }`}
          aria-hidden="true"
        />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-xs font-semibold text-on-surface">
            {user.username}
          </span>
          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/80">
            {role}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-on-surface-variant">
          {dept}
        </span>
        <span
          className={`mt-0.5 block text-[10px] ${
            presence.online
              ? 'font-medium text-emerald-600'
              : 'text-on-surface-variant/80'
          }`}
        >
          {presence.label}
        </span>
      </span>

      <span className="shrink-0 text-on-surface-variant/50">
        {starting ? (
          <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
        ) : (
          <Icon name="chat_bubble_outline" size={15} />
        )}
      </span>
    </button>
  );
}

export default function ChatPeopleList({
  users,
  presenceFor,
  onPick,
  activeUserId,
  query = '',
  startingUserId = null,
}: Props) {
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = users
      .filter((user) => {
        if (!q) return true;
        return (
          user.username.toLowerCase().includes(q) ||
          (user.deptName ?? '').toLowerCase().includes(q) ||
          (user.deptCode ?? '').toLowerCase().includes(q) ||
          (ROLE_LABELS[user.role] ?? user.role).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const roleDiff =
          (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9);
        if (roleDiff !== 0) return roleDiff;
        return a.username.localeCompare(b.username);
      });

    return {
      online: filtered.filter(
        (user) => presenceFor(user.userId, user.lastSeenAt).online,
      ),
      offline: filtered.filter(
        (user) => !presenceFor(user.userId, user.lastSeenAt).online,
      ),
    };
  }, [users, query, presenceFor]);

  const total = grouped.online.length + grouped.offline.length;

  if (total === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-12 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant">
          <Icon name="person_search" size={22} />
        </div>
        <p className="text-sm font-semibold text-on-surface">
          {query ? `No people match “${query}”` : 'No one is available'}
        </p>
        <p className="mt-1 max-w-[220px] text-[11px] leading-snug text-on-surface-variant">
          {query
            ? 'Try a different name, role, or department.'
            : 'Leadership accounts will appear here once they are active.'}
        </p>
      </div>
    );
  }

  const sections = [
    { key: 'online', label: 'Online', people: grouped.online },
    { key: 'offline', label: 'Offline', people: grouped.offline },
  ] as const;

  return (
    <div>
      {sections.map((section) => {
        if (section.people.length === 0) return null;
        return (
          <div key={section.key}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-y border-outline-variant/60 bg-surface-container-lowest/95 px-3.5 py-1.5 backdrop-blur">
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">
                {section.label}
              </span>
              <span className="text-[9px] tabular-nums text-on-surface-variant/70">
                {section.people.length}
              </span>
            </div>
            {section.people.map((user) => (
              <PersonRow
                key={user.userId}
                user={user}
                presenceFor={presenceFor}
                onPick={onPick}
                active={user.userId === activeUserId}
                starting={user.userId === startingUserId}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
