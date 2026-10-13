import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import Icon from '../../components/ui/Icon';

interface ReportCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  to: string;
  /** Roles that can see this card. Empty = all roles. */
  roles?: string[];
  /** Short label for the FR reference, shown small. */
  fr?: string;
  /** Visual accent color for the icon tile. */
  tone?: 'brand' | 'info' | 'success' | 'warning';
}

const TONE_CLASSES: Record<
  NonNullable<ReportCard['tone']>,
  { bg: string; border: string; icon: string }
> = {
  brand: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'text-[#5c1219]',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: 'text-blue-700',
  },
  success: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: 'text-emerald-700',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: 'text-amber-700',
  },
};

export default function ReportsHubPage() {
  const profile = useAuthStore((s) => s.profile);
  const role = profile?.role ?? 'viewer';

  // After the Admin→Dean consolidation, both the dev account and the
  // College Dean use the /dean route prefix. The /admin prefix is gone.
  const prefix =
    role === 'administrator' || role === 'college_dean' ? '/dean' : '';

  const isAdminOrDean =
    role === 'administrator' || role === 'college_dean';
  const isDH = role === 'department_head';

  // ── Card catalog ──
  const allCards: ReportCard[] = [
    {
      id: 'workload',
      title: 'Faculty Workload',
      description:
        'Compare assigned hours vs. required load. Flags overloaded and under-loaded faculty.',
      icon: 'insights',
      to: `${prefix}/reports/workload`,
      fr: 'FR 6.1.5',
      tone: 'brand',
    },
    {
      id: 'approvals',
      title: 'Approvals Report',
      description:
        'Cross-department faculty assignment requests — status, timeline, decisions.',
      icon: 'assignment',
      to: `${prefix}/reports/approvals`,
      fr: 'FR 6.1.6',
      tone: 'info',
    },
    {
      id: 'rooms',
      title: 'Room Sufficiency',
      description:
        'Projected demand vs. available room-hours per room type. Flags shortfalls before generation.',
      icon: 'meeting_room',
      to: `${prefix}/reports/rooms`,
      fr: 'FR 6.1.7',
      tone: 'warning',
    },
    {
      id: 'dept-summary',
      title: 'Department Schedule Summary',
      description:
        "Your department's timetable with export options for PDF, Excel, or print.",
      icon: 'grid_on',
      to: '/timetable',
      roles: ['department_head'],
      tone: 'success',
    },
    {
      id: 'college-summary',
      title: 'College-Wide Schedule',
      description:
        'Master view of all scheduled activities across the college with export options.',
      icon: 'public',
      to: `${prefix}/timetable?view=master`,
      roles: ['college_dean'],
      tone: 'success',
    },
  ];

  // ── Filter to what this role sees ──
  // `college_dean`-restricted cards are also visible to the dev account.
  const effectiveRole = isAdminOrDean ? 'college_dean' : role;
  const cards = allCards.filter(
    (c) => !c.roles || c.roles.includes(effectiveRole),
  );

  const subtitle = isAdminOrDean
    ? 'College-wide reports across all engineering departments.'
    : isDH
    ? 'Reports for your department and cross-department activity.'
    : 'Reports available to you.';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Reports</h1>
        <p className="text-on-surface-variant text-sm mt-1">{subtitle}</p>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-10 text-center">
          <Icon
            name="inbox"
            size={40}
            className="text-on-surface-variant/40 mx-auto mb-3"
          />
          <p className="text-sm text-on-surface-variant">
            No reports are available for your role.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {cards.map((card) => {
            const tone = TONE_CLASSES[card.tone ?? 'brand'];
            return (
              <Link
                key={card.id}
                to={card.to}
                className="group block p-5 border border-surface-variant bg-surface-container-lowest hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div
                    className={`w-9 h-9 ${tone.bg} border ${tone.border} flex items-center justify-center shrink-0`}
                  >
                    <Icon
                      name={card.icon}
                      filled
                      size={18}
                      className={tone.icon}
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
            );
          })}
        </div>
      )}

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3 text-sm">
        <Icon
          name="info"
          size={18}
          className="text-blue-700 shrink-0 mt-0.5"
        />
        <p className="text-blue-900 text-xs">
          Timetable-specific views (Faculty, Room, Section, Master) live on
          the <strong>Schedule Planner</strong> page. Use the export toolbar
          there to download as PDF, Excel, or print.
        </p>
      </div>
    </div>
  );
}