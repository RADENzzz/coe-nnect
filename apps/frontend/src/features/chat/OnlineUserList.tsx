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
  administrator: 'bg-red-50 text-red-700 border-red-200',
  college_dean: 'bg-blue-50 text-blue-700 border-blue-200',
  department_head: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  viewer: 'bg-slate-50 text-slate-600 border-slate-200',
};

interface Props {
  users: OnlineUser[];
  activeUserId: string | null;
  onPick: (userId: string) => void;
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
      <div
        className={
          dense ? 'px-3 py-5 text-center' : 'px-5 py-10 text-center'
        }
      >
        <Icon
          name="person_off"
          className="text-slate-300 mx-auto"
          size={dense ? 18 : 20}
        />
        <p
          className={`text-slate-500 mt-2 leading-snug ${
            dense ? 'text-[10px]' : 'text-xs'
          }`}
        >
          {dense
            ? 'No one else online'
            : "No one else online. You'll see others appear here as they log in."}
        </p>
      </div>
    );
  }

  return (
    <div className={dense ? '' : 'divide-y divide-slate-100'}>
      {users.map((u) => {
        const active = u.user_id === activeUserId;
        const roleTone = ROLE_TONES[u.role] ?? ROLE_TONES.viewer;
        return (
          <button
            key={u.user_id}
            onClick={() => onPick(u.user_id)}
            className={`w-full px-3 ${rowPadY} flex items-center ${gap} text-left transition-colors rounded ${
              active ? 'bg-[#5c1219]/5' : 'hover:bg-slate-50'
            } focus:outline-none focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-[#5c1219]/30`}
          >
            <div className="relative shrink-0">
              <div
                className={`${avatarSize} bg-slate-200 text-slate-700 font-bold flex items-center justify-center rounded-full`}
              >
                {initials(u.username)}
              </div>
              <span
                className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"
                aria-label="Online"
              />
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
            <span
              className={`text-[9px] font-bold uppercase tracking-wider border px-1.5 py-0.5 rounded ${roleTone}`}
            >
              {ROLE_LABELS[u.role] ?? u.role}
            </span>
          </button>
        );
      })}
    </div>
  );
}