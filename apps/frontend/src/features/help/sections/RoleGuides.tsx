import { motion, useReducedMotion } from 'motion/react';
import { SpotlightCard, Stagger, StaggerItem } from '../components/animations';

interface Props {
  role: string | null;
}

export function RoleGuides({ role }: Props) {
  const reduce = useReducedMotion();

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
            <motion.div
              key={g.id}
              initial={reduce ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.45, delay: idx * 0.08 }}
            >
              <SpotlightCard
                className={
                  'h-full border p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ' +
                  (isActive
                    ? 'border-brand-700 bg-brand-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-brand-300')
                }
              >
                {isActive && !reduce && (
                  <motion.div
                    className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-700 via-brand-500 to-brand-700 bg-[length:200%_100%]"
                    animate={{ backgroundPosition: ['0% 0', '200% 0'] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                  />
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

                <Stagger className="space-y-1.5 text-xs leading-relaxed text-slate-600" step={0.04}>
                  {g.items.map((item, i) => (
                    <StaggerItem key={i} className="flex gap-2">
                      <span className="material-symbols-outlined text-[14px] text-brand-700 transition-transform duration-200 group-hover:scale-110">
                        check
                      </span>
                      <span>{item}</span>
                    </StaggerItem>
                  ))}
                </Stagger>
              </SpotlightCard>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}