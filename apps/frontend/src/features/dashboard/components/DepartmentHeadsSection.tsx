import Icon from '../../../components/ui/Icon';
import type { UserDirectoryRecord } from '../../../api/users.api';
import type { Department } from '../../../api/departments.api';
import { initials } from '../utils/dashboard.utils';

export default function DepartmentHeadsSection({
  heads,
  onlineUserIds,
  departments,
  isConnected,
  dirLoading,
  onSelect,
}: {
  heads: UserDirectoryRecord[];
  onlineUserIds: Set<string>;
  departments: Department[];
  isConnected: boolean;
  dirLoading: boolean;
  onSelect: (u: UserDirectoryRecord) => void;
}) {
  const onlineCount = heads.filter((h) => onlineUserIds.has(h.user_id)).length;

  return (
    <div className="mt-6 bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50/80 to-white">
        <div className="flex items-center gap-3">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
            }`}
            aria-hidden
          />
          <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            Other Department Heads
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
            {onlineCount} of {heads.length} online
          </span>
          {heads.length > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-slate-400">
              <Icon name="touch_app" size={12} />
              Click a card
            </span>
          )}
        </div>
      </div>

      {dirLoading ? (
        <div className="py-14 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
          <Icon name="progress_activity" size={14} className="animate-spin" />
          Loading department heads…
        </div>
      ) : heads.length === 0 ? (
        <div className="py-14 text-center text-sm text-slate-400">
          No other department heads configured.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
          {heads.map((head) => {
            const isOnline = onlineUserIds.has(head.user_id);
            const dept = departments.find(
              (d) => String(d.deptId) === String(head.dept_id),
            );
            return (
              <button
                key={head.user_id}
                onClick={() => onSelect(head)}
                aria-label={`View details for ${head.username}`}
                className="group px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50 transition-colors w-full text-left focus:outline-none focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5c1219]/20"
              >
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 text-slate-700 text-xs font-bold flex items-center justify-center">
                    {initials(head.username)}
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-2 border-white rounded-full ${
                      isOnline ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                    aria-hidden
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {head.username}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {dept ? `[${dept.deptCode}] ${dept.deptName}` : 'No department'}
                  </p>
                </div>
                <span
                  className={`text-[9px] font-bold uppercase tracking-wider border px-2 py-1 shrink-0 rounded-md ${
                    isOnline
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}
                >
                  {isOnline ? 'Online' : 'Offline'}
                </span>
                <Icon
                  name="chevron_right"
                  size={16}
                  className="text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all duration-150 shrink-0"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}