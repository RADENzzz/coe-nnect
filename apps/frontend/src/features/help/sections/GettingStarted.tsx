interface Props {
  role: string | null;
}

export function GettingStarted({ role }: Props) {
  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-slate-900">Getting Started</h2>
      <p className="mb-6 text-sm leading-relaxed text-slate-700">
        CoE-NNECT is the scheduling system for the WMSU College of Engineering.
        It replaces spreadsheet-based timetables with a validated interface backed
        by a constraint engine and an automatic solver.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        <Card icon="login" title="1. Sign in" delay={0}>
          Use your WMSU email and password. You are routed to your role portal
          automatically.
        </Card>
        <Card icon="dashboard" title="2. Orient" delay={100}>
          The dashboard shows your department, active term, and quick actions.
        </Card>
        <Card icon="calendar_view_month" title="3. Schedule" delay={200}>
          Open the Schedule Planner to plot subjects manually or trigger
          auto-generate.
        </Card>
      </div>

      <div
        className="animate-fade-up mt-6 border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
        style={{ animationDelay: '300ms', animationFillMode: 'both' }}
      >
        <div className="mb-2 flex items-center gap-2 font-medium text-slate-900">
          <span className="material-symbols-outlined text-[18px] text-brand-700">
            info
          </span>
          Your role
        </div>
        {role === 'college_dean' && (
          <p>
            You are signed in as <strong>College Dean</strong>. You have full
            access to all departments, users, system settings, and archive.
          </p>
        )}
        {role === 'department_head' && (
          <p>
            You are signed in as <strong>Department Head</strong>. You can
            schedule and manage your own department&apos;s subjects, faculty,
            rooms, and sections.
          </p>
        )}
        {!role && <p>Sign in to see role-specific guidance.</p>}
      </div>
    </div>
  );
}

function Card({
  icon,
  title,
  children,
  delay = 0,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <div
      className="group animate-fade-up relative overflow-hidden border border-slate-200 bg-white p-4 transition-all duration-300 hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <div className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-brand-700 transition-transform duration-500 group-hover:scale-x-100" />
      <span className="material-symbols-outlined mb-2 inline-block text-2xl text-brand-700 transition-transform duration-300 group-hover:scale-110">
        {icon}
      </span>
      <div className="mb-1 text-sm font-semibold text-slate-900">{title}</div>
      <div className="text-xs leading-relaxed text-slate-600">{children}</div>
    </div>
  );
}