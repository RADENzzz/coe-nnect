import Icon from '../../components/ui/Icon';

// ─────────────────────────────────────────────
// Quick Action Button
// ─────────────────────────────────────────────
function QuickAction({
  icon,
  label,
}: {
  icon: string;
  label: string;
}) {
  return (
    <button className="bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 p-3 flex flex-col items-center justify-center gap-2 transition-all group">
      <Icon
        name={icon}
        className="text-[#5c1219] group-hover:scale-105 transition-transform"
      />
      <span className="text-[11px] font-semibold text-slate-700 text-center">
        {label}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────
// Summary Card
// ─────────────────────────────────────────────
function SummaryCard({
  icon,
  badge,
  badgeVariant = 'neutral',
  label,
  value,
  footer,
}: {
  icon: string;
  badge?: string;
  badgeVariant?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand';
  label: string;
  value: string;
  footer?: React.ReactNode;
}) {
  const badgeClasses = {
    neutral: 'bg-slate-50 text-slate-600 border-slate-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
    brand: 'bg-red-50 text-red-800 border-red-200',
  };

  return (
    <div className="bg-white border border-slate-200 p-5 shadow-sm hover:border-slate-300 transition-all">
      <div className="flex justify-between items-start mb-4">
        <div className="w-9 h-9 bg-red-50 border border-red-200 flex items-center justify-center">
          <Icon name={icon} filled className="text-[#5c1219]" />
        </div>
        {badge && (
          <span className={`text-[11px] font-bold uppercase tracking-wide border px-2 py-0.5 ${badgeClasses[badgeVariant]}`}>
            {badge}
          </span>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-1">{label}</p>
      <div className="text-3xl font-extrabold text-slate-900 tracking-tight">{value}</div>
      {footer && <div className="mt-4">{footer}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────
// Activity Item
// ─────────────────────────────────────────────
function ActivityItem({
  icon,
  iconBg,
  iconColor,
  text,
  time,
  actionLabel,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  text: React.ReactNode;
  time: string;
  actionLabel: string;
}) {
  return (
    <div className="p-4 px-5 flex items-center gap-4 hover:bg-slate-50 transition-colors">
      <div
        className={`w-8 h-8 flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}
      >
        <Icon name={icon} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-900 truncate">{text}</p>
        <p className="text-xs text-slate-500 mt-0.5">{time}</p>
      </div>
      <button className="text-[#5c1219] text-xs font-semibold hover:underline shrink-0">
        {actionLabel}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Dashboard Page
// ─────────────────────────────────────────────
export default function DashboardPage() {
  return (
    <>
      {/* Welcome Header */}
      <div className="mb-6 mt-1 md:mt-0 border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-1">
          Welcome back, test123
        </h1>
        <p className="text-sm text-slate-500">
          Here is the current status of the Computer Engineering department schedule.
        </p>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
        {/* Quick Actions */}
        <div className="md:col-span-4 bg-white border border-slate-200 p-5 shadow-sm flex flex-col">
          <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500 mb-3 border-b border-slate-100 pb-3">
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-2 flex-1">
            <QuickAction icon="add_circle" label="New Schedule" />
            <QuickAction icon="search" label="Search Faculty" />
            <QuickAction icon="meeting_room" label="Room Status" />
            <QuickAction icon="calendar_month" label="View Calendar" />
          </div>
        </div>

        {/* Summary Cards */}
        <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard
            icon="view_timeline"
            badge="Term A"
            badgeVariant="neutral"
            label="Active Schedules"
            value="142"
            footer={
              <div className="flex items-center gap-1">
                <Icon name="trending_up" size={14} className="text-emerald-600" />
                <span className="text-xs font-semibold text-emerald-700">+12%</span>
                <span className="text-xs text-slate-500">vs last term</span>
              </div>
            }
          />

          <SummaryCard
            icon="checklist"
            badge="Urgent"
            badgeVariant="danger"
            label="Tasks to do"
            value="8"
            footer={
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-amber-500" />
                <span className="text-xs text-slate-500">3 conflict resolutions pending</span>
              </div>
            }
          />

          <SummaryCard
            icon="donut_large"
            label="Completion Rate"
            value="85%"
            footer={
              <div className="w-full bg-slate-100 h-1.5 overflow-hidden">
                <div
                  className="bg-[#5c1219] h-1.5"
                  style={{ width: '85%' }}
                />
              </div>
            }
          />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
            Recent Scheduling Activity
          </h3>
        </div>
        <div className="divide-y divide-slate-100">
          <ActivityItem
            icon="edit_calendar"
            iconBg="bg-slate-100"
            iconColor="text-slate-600"
            text={
              <>
                Prof. Smith requested a room change for <strong>CPE 412</strong>.
              </>
            }
            time="2 hours ago"
            actionLabel="Review"
          />
          <ActivityItem
            icon="check_circle"
            iconBg="bg-emerald-50"
            iconColor="text-emerald-700"
            text={
              <>
                Schedule for <strong>Term A</strong> has been finalized by Dr. Allen.
              </>
            }
            time="Yesterday"
            actionLabel="View"
          />
        </div>
      </div>
    </>
  );
}