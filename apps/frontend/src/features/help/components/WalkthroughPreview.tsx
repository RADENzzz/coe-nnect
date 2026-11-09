import { motion, useReducedMotion } from 'motion/react';
import Icon from '../../../components/ui/Icon';

export type WalkthroughCategory =
  | 'getting-started'
  | 'scheduling'
  | 'workflow'
  | 'admin'
  | 'reports';

const CATEGORY_STYLE: Record<
  WalkthroughCategory,
  { icon: string; accent: string; label: string }
> = {
  'getting-started': {
    icon: 'dashboard',
    accent: 'from-sky-500/15 to-blue-500/5',
    label: 'Getting started',
  },
  scheduling: {
    icon: 'calendar_view_month',
    accent: 'from-emerald-500/15 to-teal-500/5',
    label: 'Scheduling',
  },
  workflow: {
    icon: 'fact_check',
    accent: 'from-amber-500/15 to-orange-500/5',
    label: 'Workflow',
  },
  admin: {
    icon: 'admin_panel_settings',
    accent: 'from-violet-500/15 to-purple-500/5',
    label: 'Administration',
  },
  reports: {
    icon: 'bar_chart',
    accent: 'from-rose-500/15 to-pink-500/5',
    label: 'Reports',
  },
};

/**
 * Lightweight animated UI preview used when a recorded GIF is not available.
 * It mirrors the structure of the app (sidebar, toolbar, content blocks) and
 * cycles a highlight so the card still communicates the workflow.
 */
export function WalkthroughPreview({
  title,
  category,
  steps,
}: {
  title: string;
  category: WalkthroughCategory;
  steps: string[];
}) {
  const reduce = useReducedMotion();
  const style = CATEGORY_STYLE[category];
  const caption = steps[0] ?? title;

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-gradient-to-br ${style.accent} text-on-surface`}
      aria-hidden="true"
    >
      {/* Soft background shapes */}
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
      <div className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-primary/10 blur-2xl" />

      {/* Mock app window */}
      <div className="absolute inset-3 overflow-hidden rounded-lg border border-outline-variant/80 bg-surface shadow-sm">
        <div className="flex items-center gap-1 border-b border-outline-variant/60 bg-surface-container-low px-2 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span className="ml-2 truncate text-[7px] font-semibold uppercase tracking-wide text-on-surface-variant">
            {title}
          </span>
        </div>

        <div className="flex h-[calc(100%-22px)]">
          {/* Sidebar */}
          <div className="hidden w-12 shrink-0 space-y-1.5 border-r border-outline-variant/60 bg-surface-container-lowest p-2 sm:block">
            <div className="flex h-3 w-3 items-center justify-center rounded bg-primary/20">
              <Icon name={style.icon} size={7} className="text-primary" />
            </div>
            {[1, 2, 3, 4].map((row) => (
              <motion.div
                key={row}
                className="h-1.5 rounded-full bg-surface-container-high"
                animate={
                  reduce
                    ? undefined
                    : { opacity: [0.5, 1, 0.5] }
                }
                transition={{
                  duration: 2.4,
                  repeat: Infinity,
                  delay: row * 0.18,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>

          {/* Main panel */}
          <div className="min-w-0 flex-1 p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="h-1.5 w-1/3 rounded-full bg-primary/40" />
              <div className="h-3 w-8 rounded bg-primary/15" />
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {[0, 1, 2, 3, 4, 5].map((cell) => {
                const emphasized = cell === 1 || cell === 4;
                return (
                  <motion.div
                    key={cell}
                    className={`h-5 rounded border ${
                      emphasized
                        ? 'border-primary/30 bg-primary/10'
                        : 'border-outline-variant/50 bg-surface-container-low'
                    }`}
                    animate={
                      reduce
                        ? undefined
                        : {
                            opacity: emphasized
                              ? [0.6, 1, 0.6]
                              : [0.85, 1, 0.85],
                          }
                    }
                    transition={{
                      duration: 3.2,
                      repeat: Infinity,
                      delay: cell * 0.12,
                      ease: 'easeInOut',
                    }}
                  />
                );
              })}
            </div>

            <div className="mt-2 space-y-1">
              <div className="h-1 w-4/5 rounded-full bg-surface-container-high" />
              <div className="h-1 w-2/3 rounded-full bg-surface-container-high" />
            </div>
          </div>
        </div>
      </div>

      {/* Moving cursor */}
      {!reduce && (
        <motion.div
          className="pointer-events-none absolute h-2 w-2 rounded-full bg-primary shadow-[0_0_0_4px_rgb(var(--primary)/0.18)]"
          animate={{
            left: ['20%', '64%', '46%', '30%', '20%'],
            top: ['62%', '42%', '68%', '50%', '62%'],
          }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Caption */}
      <div className="absolute inset-x-2 bottom-2 flex items-center gap-1.5 rounded-md border border-outline-variant/60 bg-surface/95 px-2 py-1 shadow-sm backdrop-blur">
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[7px] font-bold text-primary">
          1
        </span>
        <span className="truncate text-[8px] font-medium leading-tight text-on-surface-variant">
          {caption}
        </span>
      </div>
    </div>
  );
}
