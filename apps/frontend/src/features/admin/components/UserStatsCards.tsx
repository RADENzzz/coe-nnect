import Icon from '@/components/ui/Icon';
import type { UserRecord } from './types';

export default function UserStatsCards({ users }: { users: UserRecord[] }) {
  const total = users.length;
  const active = users.filter((u) => u.isActive).length;
  const deptHeads = users.filter((u) => u.role === 'department_head').length;
  const leadership = users.filter(
    (u) => u.role === 'college_dean' || u.role === 'college_secretary',
  ).length;

  const cards = [
    { label: 'Total users', value: total, icon: 'group', tone: 'bg-primary/10 text-primary' },
    { label: 'Active', value: active, icon: 'check_circle', tone: 'bg-green-100 text-green-700' },
    { label: 'Inactive', value: total - active, icon: 'block', tone: 'bg-red-100 text-red-700' },
    { label: 'Dept heads', value: deptHeads, icon: 'school', tone: 'bg-blue-100 text-blue-700' },
    { label: 'Leadership', value: leadership, icon: 'workspace_premium', tone: 'bg-amber-100 text-amber-700' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border border-surface-variant bg-surface-container-lowest p-3 flex items-center gap-3"
        >
          <div className={`h-9 w-9 rounded-lg grid place-items-center ${c.tone}`}>
            <Icon name={c.icon} size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-on-surface leading-none">{c.value}</p>
            <p className="text-[11px] text-on-surface-variant truncate mt-0.5">{c.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}