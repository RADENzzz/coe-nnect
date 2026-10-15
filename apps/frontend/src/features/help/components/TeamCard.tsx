import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import type { TeamMember } from '../data/team';
import { SpotlightCard } from './animations';

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
  const [tapPulseKey, setTapPulseKey] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [rippleKey, setRippleKey] = useState(0);
  const reduce = useReducedMotion();

  const handleTap = () => {
    setTapPulseKey((k) => k + 1);
    setFloatKey((k) => k + 1);
    setRippleKey((k) => k + 1);
    onTap?.();
  };

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
    >
      <SpotlightCard className="h-full border border-slate-200 bg-white p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg">
        <div
          className={
            'absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100 ' +
            (isBrand ? 'bg-brand-700' : 'bg-slate-400')
          }
        />

        <div className="relative mb-3 flex items-center gap-3">
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
                  onClick={handleTap}
                  className="relative block max-w-full truncate text-left text-sm font-semibold text-slate-900 underline decoration-transparent underline-offset-2 transition-colors hover:text-brand-700 hover:decoration-brand-700 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  aria-label={`Secret stats easter egg trigger: ${member.name}`}
                >
                  <motion.span
                    key={tapPulseKey}
                    className="easter-egg-tap-pulse inline-block"
                    whileTap={reduce ? undefined : { scale: 0.94 }}
                  >
                    {member.name}
                  </motion.span>

                  {/* Floating +1 counter */}
                  <AnimatePresence>
                    {floatKey > 0 && (
                      <motion.span
                        key={floatKey}
                        initial={{ opacity: 0, y: 0, scale: 0.8 }}
                        animate={{ opacity: 1, y: -22, scale: 1 }}
                        exit={{ opacity: 0, y: -30 }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                        className="pointer-events-none absolute -right-3 top-0 text-[11px] font-bold text-brand-700"
                      >
                        +1
                      </motion.span>
                    )}
                  </AnimatePresence>

                  {/* Ripple */}
                  {!reduce && rippleKey > 0 && (
                    <motion.span
                      key={rippleKey}
                      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-400"
                      initial={{ width: 0, height: 0, opacity: 0.8 }}
                      animate={{ width: 90, height: 90, opacity: 0 }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                    />
                  )}
                </button>

                {remainingSteps != null && remainingSteps > 0 && (
                  <motion.p
                    key={remainingSteps}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-1 text-[10px] font-medium text-brand-700"
                    aria-live="polite"
                  >
                    You are {remainingSteps} step
                    {remainingSteps === 1 ? '' : 's'} away from unlocking the
                    stats.
                  </motion.p>
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
      </SpotlightCard>
    </motion.div>
  );
}