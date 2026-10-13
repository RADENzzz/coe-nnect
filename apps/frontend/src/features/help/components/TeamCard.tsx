import type { TeamMember } from '../data/team';
import { useState } from 'react';

interface Props {
  member: TeamMember;
  index?: number;
  onTap?: () => void;
  remainingSteps?: number | null;
}

export function TeamCard({
  member,
  index = 0,
  onTap,
  remainingSteps,
}: Props) {
  const isBrand = member.accent === 'brand';
  const [pulseKey, setPulseKey] = useState(0);

  return (
    <div
      className={
        'group animate-fade-up relative overflow-hidden border border-slate-200 bg-white p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg ' +
        (onTap ? 'select-none' : '')
      }
      style={{
        animationDelay: `${index * 60}ms`,
        animationFillMode: 'both',
      }}
    >
      {/* Top accent bar */}
      <div
        className={
          'absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100 ' +
          (isBrand ? 'bg-brand-700' : 'bg-slate-400')
        }
      />

      <div className="mb-3 flex items-center gap-3">
        <div
          className={
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-transform duration-300 group-hover:scale-110 ' +
            (isBrand
              ? 'bg-brand-700 text-white'
              : 'bg-slate-100 text-slate-700 group-hover:bg-slate-200')
          }
        >
          {member.initials}
        </div>
        <div className="min-w-0">
          {onTap ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setPulseKey((key) => key + 1);
                  onTap();
                }}
                className="block max-w-full truncate text-left text-sm font-semibold text-slate-900 underline decoration-transparent underline-offset-2 transition-colors hover:text-brand-700 hover:decoration-brand-700 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-label={`Secret stats easter egg trigger: ${member.name}`}
              >
                <span key={pulseKey} className="easter-egg-tap-pulse">
                  {member.name}
                </span>
              </button>
              {remainingSteps != null && remainingSteps > 0 && (
                <p
                  className="mt-1 text-[10px] font-medium text-brand-700"
                  aria-live="polite"
                >
                  You are {remainingSteps} step
                  {remainingSteps === 1 ? '' : 's'} away from unlocking the stats.
                </p>
              )}
            </>
          ) : (
            <div className="truncate text-sm font-semibold text-slate-900">
              {member.name}
            </div>
          )}
          <div className="truncate text-xs text-slate-500">{member.role}</div>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-slate-600">{member.focus}</p>

      {member.email && (
        <a
          href={`mailto:${member.email}`}
          onClick={(e) => e.stopPropagation()}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-700 transition-colors hover:text-brand-800"
        >
          <span className="material-symbols-outlined text-[14px]">mail</span>
          {member.email}
          <span className="material-symbols-outlined text-[14px] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            arrow_forward
          </span>
        </a>
      )}
    </div>
  );
}