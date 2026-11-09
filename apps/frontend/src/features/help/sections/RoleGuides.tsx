import { useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import Icon from '../../../components/ui/Icon';
import { useTutorialStore } from '../../../store/tutorial.store';
import { SpotlightCard, Stagger, StaggerItem } from '../components/animations';
import { getTourStartPath, getTour, tourMatchesPath } from '../../tutorial/tours';

interface Props {
  role: string | null;
}

const GUIDES = [
  {
    id: 'dean',
    role: 'college_dean',
    title: 'College Dean',
    summary:
      'College-wide oversight: terms, departments, users, approvals, reports, and audit.',
    tourId: 'dean-dashboard',
    to: '/dean/dashboard',
    items: [
      'Create and activate academic terms',
      'Manage all engineering departments and users',
      'Configure college-wide scheduling rules',
      'Review and publish department schedules',
      'Browse reports, audit trail, and imports',
    ],
  },
  {
    id: 'secretary',
    role: 'college_secretary',
    title: 'College Secretary',
    summary:
      'Day-to-day college operations without approval or audit authority.',
    tourId: 'dean-dashboard',
    to: '/dean/dashboard',
    items: [
      'Maintain departments, faculty, subjects, and rooms',
      'Keep prospectuses and sections up to date',
      'Review timetables and college reports',
      'Support the dean with scheduling records',
    ],
  },
  {
    id: 'dh',
    role: 'department_head',
    title: 'Department Head',
    summary:
      'Own one department: data setup, timetable planning, and faculty requests.',
    tourId: 'dashboard',
    to: '/dashboard',
    items: [
      "Schedule and manage your department's timetable",
      'Plot subjects manually or run auto-generate',
      'Manage faculty, rooms, subjects, and sections',
      'Request faculty from other departments',
      'Flag entries for college-wide review',
    ],
  },
];

export function RoleGuides({ role }: Props) {
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const location = useLocation();
  const startTour = useTutorialStore((s) => s.startTour);
  const queueTour = useTutorialStore((s) => s.queueTour);
  const markOnboarded = useTutorialStore((s) => s.markOnboarded);

  const start = (tourId: string, to: string) => {
    const tour = getTour(tourId);
    if (!tour) return;
    markOnboarded();
    const path = getTourStartPath(tour, location.pathname) ?? to;
    if (
      path !== location.pathname &&
      !tourMatchesPath(tour, location.pathname)
    ) {
      queueTour(tourId);
      navigate(path);
      return;
    }
    startTour(tourId);
  };

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-on-surface">
        Role Guides
      </h2>
      <p className="mb-6 text-sm leading-relaxed text-on-surface-variant">
        Your role determines which pages and actions appear in the sidebar. The
        active card below is your account.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        {GUIDES.map((guide, idx) => {
          const isActive = role === guide.role;
          const tour = getTour(guide.tourId);
          return (
            <motion.div
              key={guide.id}
              initial={reduce ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.45, delay: idx * 0.08 }}
            >
              <SpotlightCard
                className={`h-full border p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${
                  isActive
                    ? 'border-primary/50 bg-primary/[0.04] shadow-sm'
                    : 'border-outline-variant bg-surface hover:border-primary/40'
                }`}
              >
                {isActive && !reduce && (
                  <motion.div
                    className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary via-primary/60 to-primary bg-[length:200%_100%]"
                    animate={{ backgroundPosition: ['0% 0', '200% 0'] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                  />
                )}

                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-on-surface">
                    {guide.title}
                  </div>
                  {isActive && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-on-primary">
                      <Icon name="person" size={11} />
                      You
                    </span>
                  )}
                </div>

                <p className="mb-3 text-xs leading-relaxed text-on-surface-variant">
                  {guide.summary}
                </p>

                <Stagger
                  className="space-y-1.5 text-xs leading-relaxed text-on-surface-variant"
                  step={0.04}
                >
                  {guide.items.map((item) => (
                    <StaggerItem key={item} className="flex gap-2">
                      <Icon
                        name="check"
                        size={13}
                        className="mt-0.5 shrink-0 text-primary transition-transform duration-200 group-hover:scale-110"
                      />
                      <span>{item}</span>
                    </StaggerItem>
                  ))}
                </Stagger>

                {tour && (
                  <button
                    type="button"
                    onClick={() => start(guide.tourId, guide.to)}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-on-surface transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <Icon name="play_arrow" size={13} />
                    Tour this portal
                  </button>
                )}
              </SpotlightCard>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
