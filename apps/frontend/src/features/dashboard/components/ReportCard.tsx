import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Shared dashboard report card.
 *
 * Keeps the department and college dashboards on the same visual rhythm:
 * a compact header with a destination link and a flexible body.
 */
export default function ReportCard({
  title,
  subtitle,
  to,
  linkLabel,
  children,
}: {
  title: string;
  subtitle: string;
  to: string;
  linkLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
      <header className="flex items-start justify-between gap-3 border-b border-outline-variant/70 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-on-surface">{title}</h2>
          <p className="mt-0.5 text-[11px] text-on-surface-variant">
            {subtitle}
          </p>
        </div>
        <Link
          to={to}
          className="shrink-0 text-[11px] font-semibold text-primary hover:underline"
        >
          {linkLabel}
        </Link>
      </header>
      <div className="flex flex-1 flex-col p-4">{children}</div>
    </section>
  );
}
