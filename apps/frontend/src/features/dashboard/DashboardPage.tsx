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
    <button className="bg-surface-container-low hover:border-secondary-container border border-transparent rounded-lg p-3 flex flex-col items-center justify-center gap-2 transition-all group">
      <Icon
        name={icon}
        className="text-primary group-hover:text-secondary-container"
      />
      <span className="text-xs font-semibold text-on-surface text-center">
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
  iconBg,
  iconColor,
  badge,
  badgeClass,
  label,
  value,
  footer,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  badge?: string;
  badgeClass?: string;
  label: string;
  value: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-6 shadow-card border border-surface-variant/30 hover:border-secondary-container transition-all">
      <div className="flex justify-between items-start mb-4">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center ${iconBg} ${iconColor}`}
        >
          <Icon name={icon} filled />
        </div>
        {badge && (
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${badgeClass}`}>
            {badge}
          </span>
        )}
      </div>
      <h4 className="text-sm text-on-surface-variant mb-1">{label}</h4>
      <div className="text-3xl font-bold text-on-surface">{value}</div>
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
    <div className="p-4 px-6 flex items-center gap-4 hover:bg-surface-bright transition-colors">
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}
      >
        <Icon name={icon} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-on-surface truncate">{text}</p>
        <p className="text-xs font-semibold text-on-surface-variant mt-1">
          {time}
        </p>
      </div>
      <button className="text-primary text-xs font-semibold hover:underline shrink-0">
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
      <div className="mb-8 mt-4 md:mt-0">
        <h2 className="text-4xl font-bold text-on-surface mb-2 tracking-tight">
          Welcome back, test123
        </h2>
        <p className="text-base text-on-surface-variant">
          Here is the current status of the Computer Engineering department
          schedule.
        </p>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-8">
        {/* Quick Actions */}
        <div className="md:col-span-4 bg-surface-container-lowest rounded-xl p-6 shadow-card border border-surface-variant/30 flex flex-col">
          <h3 className="text-xl font-semibold text-on-surface mb-4 border-b border-surface-container pb-2">
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-3 flex-1">
            <QuickAction icon="add_circle" label="New Schedule" />
            <QuickAction icon="search" label="Search Faculty" />
            <QuickAction icon="meeting_room" label="Room Status" />
            <QuickAction icon="calendar_month" label="View Calendar" />
          </div>
        </div>

        {/* Summary Cards */}
        <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <SummaryCard
            icon="view_timeline"
            iconBg="bg-primary-container/20"
            iconColor="text-primary"
            badge="Term A"
            badgeClass="text-on-surface-variant bg-surface-container-high"
            label="Active Schedules"
            value="142"
            footer={
              <div className="flex items-center gap-1 text-sm">
                <Icon name="trending_up" size={16} className="text-green-700" />
                <span className="text-xs font-semibold text-green-700">+12%</span>
                <span className="text-xs text-on-surface-variant">
                  vs last term
                </span>
              </div>
            }
          />

          <SummaryCard
            icon="checklist"
            iconBg="bg-secondary-container/20"
            iconColor="text-secondary"
            badge="Urgent"
            badgeClass="text-primary bg-primary-fixed"
            label="Tasks to do"
            value="8"
            footer={
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-tertiary" />
                <span className="text-xs text-on-surface-variant">
                  3 conflict resolutions pending
                </span>
              </div>
            }
          />

          <SummaryCard
            icon="donut_large"
            iconBg="bg-primary/10"
            iconColor="text-primary"
            label="Completion Rate"
            value="85%"
            footer={
              <div className="w-full bg-surface-container-high rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{ width: '85%' }}
                />
              </div>
            }
          />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-variant/30 overflow-hidden">
        <div className="p-6 border-b border-surface-container">
          <h3 className="text-xl font-semibold text-on-surface">
            Recent Scheduling Activity
          </h3>
        </div>
        <div className="divide-y divide-surface-container">
          <ActivityItem
            icon="edit_calendar"
            iconBg="bg-secondary-container/20"
            iconColor="text-secondary"
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
            iconBg="bg-green-100"
            iconColor="text-green-800"
            text={
              <>
                Schedule for <strong>Term A</strong> has been finalized by Dr.
                Allen.
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