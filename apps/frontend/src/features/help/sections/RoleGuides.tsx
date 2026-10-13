interface Props {
  role: string | null;
}

export function RoleGuides({ role }: Props) {
  const guides = [
    {
      id: 'dean',
      title: 'College Dean',
      items: [
        'Manage all 10 engineering departments',
        'Create and manage users',
        'Configure system settings and terms',
        'Review and approve cross-department requests',
        'Browse the audit trail and version history',
      ],
    },
    {
      id: 'dh',
      title: 'Department Head',
      items: [
        "Schedule and manage your department's timetable",
        'Plot subjects manually or run auto-generate',
        'Manage faculty, rooms, and sections for your department',
        'Request faculty from other departments',
        'Flag entries for college-wide review',
      ],
    },
  ];

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-slate-900">Role Guides</h2>
      <p className="mb-6 text-sm leading-relaxed text-slate-700">
        CoE-NNECT has two user-facing roles. Your role determines which features
        appear in the sidebar and what actions are available.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {guides.map((g, idx) => {
          const isActive =
            (g.id === 'dean' && role === 'college_dean') ||
            (g.id === 'dh' && role === 'department_head');
          return (
            <div
              key={g.id}
              className={
                'animate-fade-up group relative overflow-hidden border p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ' +
                (isActive
                  ? 'border-brand-700 bg-brand-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-brand-300')
              }
              style={{
                animationDelay: `${idx * 100}ms`,
                animationFillMode: 'both',
              }}
            >
              {isActive && (
                <div className="animate-shimmer absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-700 via-brand-500 to-brand-700 bg-[length:200%_100%]" />
              )}

              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">
                  {g.title}
                </div>
                {isActive && (
                  <span className="flex items-center gap-1 rounded-full bg-brand-700 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">
                    <span className="material-symbols-outlined text-[12px]">
                      person
                    </span>
                    You
                  </span>
                )}
              </div>

              <ul className="space-y-1.5 text-xs leading-relaxed text-slate-600">
                {g.items.map((item, i) => (
                  <li
                    key={i}
                    className="animate-fade-up flex gap-2"
                    style={{
                      animationDelay: `${idx * 100 + i * 40}ms`,
                      animationFillMode: 'both',
                    }}
                  >
                    <span className="material-symbols-outlined text-[14px] text-brand-700 transition-transform duration-200 group-hover:scale-110">
                      check
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}