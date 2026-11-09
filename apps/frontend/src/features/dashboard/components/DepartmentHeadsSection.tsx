import Icon from '../../../components/ui/Icon';
import type { UserDirectoryRecord } from '../../../api/users.api';
import type { Department } from '../../../api/departments.api';
import { initials } from '../utils/dashboard.utils';

/**
 * Compact department-head presence list.
 * Presence is the only signal here, so the rows carry a dot and a name,
 * not a badge stack.
 */
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
    <div className="mt-4 overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
            }`}
            aria-hidden="true"
          />
          <h3 className="text-sm font-bold text-on-surface">
            Department heads
          </h3>
          <span className="text-[11px] text-on-surface-variant tabular-nums">
            {onlineCount} of {heads.length} online
          </span>
        </div>
        {heads.length > 0 && (
          <span className="hidden items-center gap-1 text-[10px] text-on-surface-variant sm:inline-flex">
            <Icon name="touch_app" size={12} />
            Select for details
          </span>
        )}
      </div>

      {dirLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-on-surface-variant">
          <Icon name="progress_activity" size={14} className="animate-spin" />
          Loading department heads…
        </div>
      ) : heads.length === 0 ? (
        <div className="py-10 text-center text-sm text-on-surface-variant">
          No other department heads configured.
        </div>
      ) : (
        <div className="grid grid-cols-1 divide-y divide-outline-variant/50 md:grid-cols-2 md:divide-y-0 md:divide-x">
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
                className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-container-low focus:outline-none focus-visible:bg-surface-container-low focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/20"
              >
                <div className="relative shrink-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container text-[11px] font-bold text-on-surface">
                    {initials(head.username)}
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface ${
                      isOnline ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                    aria-hidden="true"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-on-surface">
                    {head.username}
                  </p>
                  <p className="truncate text-[11px] text-on-surface-variant">
                    {dept
                      ? `[${dept.deptCode}] ${dept.deptName}`
                      : 'No department'}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[10px] font-semibold ${
                    isOnline
                      ? 'text-emerald-700'
                      : 'text-on-surface-variant'
                  }`}
                >
                  {isOnline ? 'Online' : 'Offline'}
                </span>
                <Icon
                  name="chevron_right"
                  size={15}
                  className="shrink-0 text-on-surface-variant/50 transition-transform group-hover:translate-x-0.5 group-hover:text-on-surface-variant"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
