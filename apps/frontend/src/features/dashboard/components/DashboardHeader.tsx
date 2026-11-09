import type { ReactNode } from 'react';
import Icon from '../../../components/ui/Icon';

/**
 * Shared dashboard masthead.
 *
 * Keeps the department and dean dashboards on the same rhythm: identity
 * tile, context line, greeting, then the page-specific status / actions.
 * All colours are token-driven so both themes follow the user's accent.
 */
export default function DashboardHeader({
  eyebrow,
  title,
  subtitle,
  roleLabel,
  icon = 'dashboard',
  status,
  actions,
  tourId,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle: ReactNode;
  roleLabel?: string;
  icon?: string;
  status?: ReactNode;
  actions?: ReactNode;
  tourId?: string;
}) {
  const today = new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="mb-6 mt-1 md:mt-0" data-tour={tourId}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-container text-on-primary shadow-sm">
            <Icon name={icon} size={24} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
              <span>{eyebrow}</span>
              <span
                className="h-1 w-1 rounded-full bg-on-surface-variant/40"
                aria-hidden="true"
              />
              <span>{today}</span>
              {roleLabel && (
                <span className="rounded-md border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-primary">
                  {roleLabel}
                </span>
              )}
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-on-surface sm:text-[26px]">
              {title}
            </h1>
            <div className="mt-1 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
              {subtitle}
            </div>
          </div>
        </div>

        {(status || actions) && (
          <div className="flex flex-wrap items-center gap-2">
            {status}
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
