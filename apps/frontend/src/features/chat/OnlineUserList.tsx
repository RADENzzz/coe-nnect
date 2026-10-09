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

const ROLE_TONES: Record<string, string> = {
  administrator: 'badge-danger',
  college_dean: 'badge-neutral',
  department_head: 'badge-success',
  viewer: 'badge-neutral',
};

interface Props {
  users: OnlineUser[];
  activeUserId: string | null;
  onPick: (userId: string) => void;
  /** Compact spacing for use inside a dropdown. */
  dense?: boolean;
}

export default function OnlineUserList({
  users,
  activeUserId,
  onPick,
  dense = false,
}: Props) {
  const rowPadY = dense ? 'py-2' : 'py-2.5';
  const gap = dense ? 'gap-2' : 'gap-2.5';
  const avatarSize = dense ? 'w-8 h-8 text-[10px]' : 'w-9 h-9 text-[11px]';

  if (users.length === 0) {
    return (
      <div className={dense ? 'px-3 py-5 text-center' : 'px-5 py-10 text-center'}>
        <Icon name="person_off" className="text-slate-300 mx-auto" size={dense ? 18 : 20} />
        <p className={`text-slate-500 mt-2 leading-snug ${dense ? 'text-[10px]' : 'text-xs'}`}>
          {dense ? 'No one else online' : "No one else online. You'll see others appear here as they log in."}
        </p>
      </div>
    );
  }

  return (
    <div className={dense ? '' : 'divide-y divide-slate-100'}>
      {users.map((u) => {
        const active = u.user_id === activeUserId;
        const roleTone = ROLE_TONES[u.role] ?? 'badge-neutral';
        return (
          <button
            key={u.user_id}
            onClick={() => onPick(u.user_id)}
            className={`w-full px-3 ${rowPadY} flex items-center ${gap} text-left transition-colors ${
              active ? 'bg-[#5c1219]/5' : 'hover:bg-slate-50'
            }`}
          >
            <div className="relative shrink-0">
              <div
                className={`${avatarSize} bg-slate-200 text-slate-700 font-bold flex items-center justify-center`}
              >
                {initials(u.username)}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900 truncate leading-tight">
                {u.username}
              </p>
              <p className="text-[10px] text-slate-500 truncate leading-tight mt-0.5">
                {u.dept_name
                  ? `[${u.dept_code ?? '—'}] ${u.dept_name}`
                  : 'College of Engineering'}
              </p>
            </div>
            <span className={`${roleTone} text-[9px]`}>
              {ROLE_LABELS[u.role] ?? u.role}
            </span>
          </button>
        );
      })}
    </div>
  );
}