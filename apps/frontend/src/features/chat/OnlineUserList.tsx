import Icon from '../../components/ui/Icon';
import type { OnlineUser } from '../../hooks/use-online-users';

function initials(username: string): string {
  if (!username) return '—';
  return username.slice(0, 2).toUpperCase();
}

const ROLE_LABELS: Record<string, string> = {
  administrator: 'Admin',
  college_dean: 'Dean',
  department_head: 'DH',
  viewer: 'Viewer',
};

interface Props {
  users: OnlineUser[];
  activeUserId: string | null;
  onPick: (userId: string) => void;
}

export default function OnlineUserList({ users, activeUserId, onPick }: Props) {
  if (users.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <Icon name="person_off" className="text-slate-300" size={32} />
        <p className="text-xs text-slate-500 mt-2">
          No one else is online right now.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {users.map((u) => {
        const active = u.user_id === activeUserId;
        return (
          <button
            key={u.user_id}
            onClick={() => onPick(u.user_id)}
            className={`w-full px-3 py-2.5 flex items-center gap-3 text-left transition-colors ${
              active
                ? 'bg-[#5c1219]/5 border-l-2 border-[#5c1219]'
                : 'hover:bg-slate-50 border-l-2 border-transparent'
            }`}
          >
            <div className="relative shrink-0">
              <div className="w-8 h-8 bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center">
                {initials(u.username)}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900 truncate">
                {u.username}
              </p>
              <p className="text-[10px] text-slate-500 truncate">
                {u.dept_name
                  ? `[${u.dept_code ?? '—'}] ${u.dept_name}`
                  : 'College of Engineering'}
              </p>
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 shrink-0">
              {ROLE_LABELS[u.role] ?? u.role}
            </span>
          </button>
        );
      })}
    </div>
  );
}