import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import Icon from '../../../components/ui/Icon';
import { Reveal, SpotlightCard, Stagger, StaggerItem } from '../components/animations';

interface Props {
  role: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  college_dean: 'College Dean',
  college_secretary: 'College Secretary',
  department_head: 'Department Head',
};

export function GettingStarted({ role }: Props) {
  const reduce = useReducedMotion();
  const isDean = role === 'college_dean';
  const isSecretary = role === 'college_secretary';

  const steps = isSecretary
    ? [
        {
          icon: 'corporate_fare',
          title: '1. Keep departments current',
          body: 'Confirm department details, heads, and active status are up to date.',
          to: '/dean/departments',
          link: 'Departments',
        },
        {
          icon: 'groups',
          title: '2. Maintain college records',
          body: 'Keep faculty, subjects, sections, and rooms accurate for scheduling.',
          to: '/dean/faculty',
          link: 'Faculty',
        },
        {
          icon: 'calendar_view_month',
          title: '3. Review the timetable',
          body: 'Open the college timetable and reports to check coverage and readiness.',
          to: '/dean/timetable',
          link: 'Timetable',
        },
      ]
    : isDean
      ? [
          {
            icon: 'calendar_month',
            title: '1. Activate the term',
            body: 'Create and activate the academic term before departments schedule.',
            to: '/dean/system-settings',
            link: 'System settings',
          },
          {
            icon: 'corporate_fare',
            title: '2. Check departments',
            body: 'Confirm each department is active and has a department head assigned.',
            to: '/dean/departments',
            link: 'Departments',
          },
          {
            icon: 'fact_check',
            title: '3. Review schedules',
            body: 'Approve department schedules, then publish the finalized timetables.',
            to: '/dean/approvals',
            link: 'Approvals',
          },
        ]
      : [
          {
            icon: 'groups',
            title: '1. Set up your data',
            body: 'Add faculty, rooms, subjects, programs, and sections for your department.',
            to: '/faculty',
            link: 'Faculty',
          },
          {
            icon: 'library_books',
            title: '2. Map the curriculum',
            body: 'Use the Prospectus to place subjects in the correct year and semester.',
            to: '/prospectus',
            link: 'Prospectus',
          },
          {
            icon: 'calendar_view_month',
            title: '3. Build the timetable',
            body: 'Plot classes manually or run Auto-Generate, then send for approval.',
            to: '/timetable',
            link: 'Schedule Planner',
          },
        ];

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-on-surface">
        Getting Started
      </h2>
      <p className="mb-6 text-sm leading-relaxed text-on-surface-variant">
        CoE-NNECT is the scheduling system for the WMSU College of Engineering.
        It replaces spreadsheet-based timetables with a validated interface
        backed by a constraint engine and an automatic solver.
      </p>

      <Stagger className="grid gap-4 md:grid-cols-3" step={0.1}>
        {steps.map((step) => (
          <StaggerItem key={step.title}>
            <StepCard {...step} />
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal delay={0.15}>
        <div className="mt-6 border border-outline-variant bg-surface-container-lowest p-4 text-sm text-on-surface-variant">
          <div className="mb-2 flex items-center gap-2 font-medium text-on-surface">
            <motion.span
              animate={reduce ? undefined : { rotate: [0, -8, 8, 0] }}
              transition={{ duration: 4, repeat: Infinity, repeatDelay: 3 }}
            >
              <Icon name="info" size={18} className="text-primary" />
            </motion.span>
            Your role
          </div>
          {role ? (
            <p>
              You are signed in as{' '}
              <strong className="text-on-surface">
                {ROLE_LABELS[role] ?? role}
              </strong>
              . {isDean
                ? 'You can see college-wide data, manage departments and users, and review schedules across every department.'
                : 'Your workspace is limited to your own department: faculty, rooms, subjects, sections, prospects, and its timetable.'}
            </p>
          ) : (
            <p>Sign in to see role-specific guidance.</p>
          )}
        </div>
      </Reveal>

      <Reveal delay={0.2}>
        <div className="mt-4 border border-outline-variant bg-surface p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-on-surface">
            <Icon name="keyboard" size={18} className="text-primary" />
            Keyboard shortcuts
          </div>
          <dl className="grid gap-2 text-xs text-on-surface-variant sm:grid-cols-2">
            {[
              ['Ctrl / ⌘ + K', 'Open global search'],
              ['/', 'Jump to Help search'],
              ['← / →', 'Move between tour steps'],
              ['Esc', 'Close a guide or dialog'],
            ].map(([keys, action]) => (
              <div key={keys} className="flex items-center justify-between gap-3">
                <dt className="rounded border border-outline-variant bg-surface-container-low px-1.5 py-0.5 font-mono text-[10px] font-semibold text-on-surface">
                  {keys}
                </dt>
                <dd className="text-right">{action}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Reveal>
    </div>
  );
}

function StepCard({
  icon,
  title,
  body,
  to,
  link,
}: {
  icon: string;
  title: string;
  body: string;
  to: string;
  link: string;
}) {
  return (
    <SpotlightCard className="h-full border border-outline-variant bg-surface p-4 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">
      <div className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-primary transition-transform duration-500 group-hover:scale-x-100" />
      <span className="mb-2 inline-flex text-primary transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
        <Icon name={icon} size={24} />
      </span>
      <div className="mb-1 text-sm font-semibold text-on-surface">{title}</div>
      <div className="text-xs leading-relaxed text-on-surface-variant">
        {body}
      </div>
      <Link
        to={to}
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
      >
        Open {link}
        <Icon name="arrow_forward" size={13} />
      </Link>
    </SpotlightCard>
  );
}
