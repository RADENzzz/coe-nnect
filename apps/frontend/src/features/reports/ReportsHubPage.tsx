import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { ROUTES } from '../../router';
import Icon from '../../components/ui/Icon';

interface ReportCard {
  title: string;
  description: string;
  icon: string;
  to: string;
  /** Roles that can see this card. Empty = all roles. */
  roles?: string[];
  /** Short label for the FR reference, shown small. */
  fr?: string;
}

export default function ReportsHubPage() {
  const profile = useAuthStore((s) => s.profile);
  const role = profile?.role ?? 'viewer';

  // Determine prefix based on role — matches App.tsx route structure
  const prefix =
    role === 'administrator'
      ? '/admin'
      : role === 'college_dean'
      ? '/dean'
      : '';

  const cards: ReportCard[] = [
    {
      title: 'Faculty Timetable',
      description:
        "View a single faculty member's assigned classes across the week.",
      icon: 'person',
      to: `${prefix}/timetable?view=faculty`,
      fr: 'FR 6.1.1',
    },
    {
      title: 'Room Timetable',
      description: "View a single room's schedule of assigned classes.",
      icon: 'meeting_room',
      to: `${prefix}/timetable?view=room`,
      fr: 'FR 6.1.2',
    },
    {
      title: 'Student Timetable',
      description: "View a section's weekly schedule.",
      icon: 'groups',
      to: `${prefix}/timetable?view=section`,
      fr: 'FR 6.1.3',
    },
    {
      title: 'Master Schedule',
      description:
        'Grid view of all scheduled activities across the college.',
      icon: 'grid_on',
      to: `${prefix}/timetable?view=master`,
      fr: 'FR 6.1.4',
    },
    {
      title: 'Faculty Workload',
      description:
        'Compare assigned hours vs. required load; highlight overloads.',
      icon: 'insights',
      to: `${prefix}/reports/workload`,
      fr: 'FR 6.1.5',
    },
    {
      title: 'Approvals Report',
      description:
        'Cross-department faculty assignment requests — status, timeline, decisions.',
      icon: 'assignment',
      to: `${prefix}/reports/approvals`,
      fr: 'FR 6.1.6',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Reports</h1>
        <p className="text-on-surface-variant text-sm mt-1">
          Generate, view, and export reports for schedules, workloads, and
          approvals.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((card) => (
          <Link
            key={card.title}
            to={card.to}
            className="group block p-5 border transition-colors"
            style={{
              backgroundColor: 'rgb(var(--surface))',
              borderColor: 'rgb(var(--outline-variant))',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgb(var(--outline))';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgb(var(--outline-variant))';
            }}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="w-9 h-9 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 flex items-center justify-center shrink-0">
                <Icon
                  name={card.icon}
                  filled
                  size={18}
                  className="text-[#5c1219] dark:text-red-400"
                />
              </div>
              {card.fr && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  {card.fr}
                </span>
              )}
            </div>
            <p className="font-bold text-on-surface mb-1">{card.title}</p>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              {card.description}
            </p>
            <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-primary group-hover:gap-2 transition-all">
              Open
              <Icon name="arrow_forward" size={14} />
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 px-4 py-3 flex items-start gap-3 text-sm">
        <Icon
          name="info"
          size={18}
          className="text-blue-700 dark:text-blue-300 shrink-0 mt-0.5"
        />
        <p className="text-blue-900 dark:text-blue-200 text-xs">
          Timetable reports open the Schedule Planner filtered to the
          requested view. Use the export toolbar on that page to download as
          PDF or Excel, or print directly.
        </p>
      </div>
    </div>
  );
}