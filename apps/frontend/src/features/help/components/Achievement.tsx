import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';

export interface AchievementData {
  id: string;
  title: string;
  description: string;
  icon: string;      // Material Symbols icon name
  rarity?: string;   // e.g. "Rare", "Legendary"
}

interface Props {
  achievement: AchievementData | null;
  onDismiss?: () => void;
  /** Auto-dismiss duration (ms). */
  duration?: number;
}

export function Achievement({ achievement, onDismiss, duration = 5500 }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!achievement) return;
    setVisible(true);
    const t = window.setTimeout(() => {
      setVisible(false);
      window.setTimeout(() => onDismiss?.(), 400);
    }, duration);
    return () => window.clearTimeout(t);
  }, [achievement, duration, onDismiss]);

  return (
    <AnimatePresence>
      {visible && achievement && (
        <motion.div
          key={achievement.id}
          initial={{ opacity: 0, y: -80, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -30, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 380, damping: 26, mass: 0.7 }}
          className="pointer-events-none fixed right-4 top-4 z-[10000] w-[340px]"
          role="status"
          aria-live="polite"
        >
          {/* Steam-style container */}
          <div
            className="relative overflow-hidden border border-slate-700 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.75)]"
            style={{
              boxShadow:
                '0 0 0 1px rgba(148,163,184,0.15), 0 20px 60px -10px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            {/* Top shimmer bar */}
            <motion.div
              aria-hidden
              className="absolute inset-x-0 top-0 h-[2px]"
              style={{
                background:
                  'linear-gradient(90deg, transparent, #fbbf24, #f59e0b, #fbbf24, transparent)',
                backgroundSize: '200% 100%',
              }}
              animate={{ backgroundPosition: ['-200% 0', '200% 0'] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
            />

            {/* Corner flare */}
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full"
              style={{
                background:
                  'radial-gradient(circle, rgba(251,191,36,0.35) 0%, transparent 65%)',
                filter: 'blur(20px)',
              }}
              animate={{ opacity: [0.4, 0.9, 0.4], scale: [1, 1.15, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />

            <div className="relative flex items-start gap-3 p-4">
              {/* Icon plate */}
              <motion.div
                initial={{ rotate: -12, scale: 0.6 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 380, damping: 18 }}
                className="relative flex h-14 w-14 shrink-0 items-center justify-center border border-amber-500/60 bg-gradient-to-br from-amber-400/20 to-amber-700/10"
                style={{
                  boxShadow:
                    '0 0 20px rgba(251,191,36,0.4), inset 0 0 12px rgba(251,191,36,0.15)',
                }}
              >
                <span
                  className="material-symbols-outlined text-[28px] text-amber-300"
                  style={{ textShadow: '0 0 10px rgba(251,191,36,0.9)' }}
                >
                  {achievement.icon}
                </span>
                {/* Inner pulse */}
                <motion.span
                  aria-hidden
                  className="absolute inset-0 border border-amber-300/40"
                  animate={{ opacity: [0.2, 0.7, 0.2] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                />
              </motion.div>

              <div className="min-w-0 flex-1 pt-0.5">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-amber-400/90">
                    Achievement Unlocked
                  </span>
                  {achievement.rarity && (
                    <span className="border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-300">
                      {achievement.rarity}
                    </span>
                  )}
                </div>
                <h4 className="truncate text-sm font-bold leading-tight text-white">
                  {achievement.title}
                </h4>
                <p className="mt-1 text-[11px] leading-snug text-slate-300/90">
                  {achievement.description}
                </p>
              </div>
            </div>

            {/* Bottom progress drain */}
            <motion.div
              aria-hidden
              className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-amber-500 to-amber-300"
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: duration / 1000, ease: 'linear' }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}