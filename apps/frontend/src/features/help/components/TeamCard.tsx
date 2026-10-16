import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import type { TeamMember } from '../data/team';
import { SpotlightCard } from './animations';

interface Props {
  member: TeamMember;
  index?: number;
  onTap?: () => void;
  remainingSteps?: number | null;
  /** Mirrors the easter-egg store's tap count when this card is the trigger. */
  storeTaps?: number;
}

// ═══════════════════════════════════════════════════════════
// 7 manga messages — one per tap. 8th tap triggers easter egg.
// ═══════════════════════════════════════════════════════════

const MANGA_MESSAGES: string[] = [
  "Hey! Don't touch that!",
  'Wag NGANI!!!?',
  'Are you serious right now?',
  'This is NOT a button!',
  'One more tap and I swear…',
  'Okay, seriously, cut it out!',
  "Fine! You asked for it…",
];

const MANGA_STYLES = [
  { bg: 'bg-white',    border: 'border-slate-900', text: 'text-slate-900', rotate: -3, tail: 'fill-slate-900', fill: 'fill-white' },
  { bg: 'bg-amber-50', border: 'border-amber-700', text: 'text-amber-900', rotate:  3, tail: 'fill-amber-700', fill: 'fill-amber-50' },
  { bg: 'bg-red-50',   border: 'border-red-700',   text: 'text-red-900',   rotate: -4, tail: 'fill-red-700',   fill: 'fill-red-50' },
  { bg: 'bg-white',    border: 'border-slate-900', text: 'text-slate-900', rotate:  2, tail: 'fill-slate-900', fill: 'fill-white' },
  { bg: 'bg-orange-50',border: 'border-orange-700',text: 'text-orange-900',rotate: -3, tail: 'fill-orange-700',fill: 'fill-orange-50' },
  { bg: 'bg-red-100',  border: 'border-red-800',   text: 'text-red-950',   rotate:  4, tail: 'fill-red-800',   fill: 'fill-red-100' },
  { bg: 'bg-brand-700',border: 'border-brand-900', text: 'text-white',     rotate: -2, tail: 'fill-brand-900', fill: 'fill-brand-700' },
];

export function TeamCard({
  member,
  index = 0,
  onTap,
  remainingSteps,
  storeTaps,
}: Props) {
  const isBrand = member.accent === 'brand';
  const [tapPulseKey, setTapPulseKey] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [rippleKey, setRippleKey] = useState(0);
  const [isShaking, setIsShaking] = useState(false);

  const shakeTimer = useRef<number | null>(null);
  const bubbleTimer = useRef<number | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    return () => {
      if (shakeTimer.current) window.clearTimeout(shakeTimer.current);
    };
  }, []);

  // When the store is driving this card, messageIndex mirrors taps 1..7.
// Tap 8 → store resets taps to 0 → messageIndex = -1 → bubble clears.
const messageIndex =
  storeTaps != null && storeTaps > 0 && storeTaps <= MANGA_MESSAGES.length
    ? storeTaps - 1
    : -1;

const handleTap = useCallback(() => {
  setTapPulseKey((k) => k + 1);
  setFloatKey((k) => k + 1);
  setRippleKey((k) => k + 1);

  // Call the store on EVERY tap so its counter stays in sync with the bubble.
  // The store handles the reveal on tap 8 and clears taps.
  onTap?.();

  // One-shot card shake per tap
  if (!reduce) {
    setIsShaking(true);
    if (shakeTimer.current) window.clearTimeout(shakeTimer.current);
    shakeTimer.current = window.setTimeout(() => setIsShaking(false), 400);
  }

}, [onTap, reduce]);

  const activeStyle =
    messageIndex >= 0 && messageIndex < MANGA_STYLES.length
      ? MANGA_STYLES[messageIndex]
      : null;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      // ⚠️ NOT overflow-hidden — lets the bubble overlay outside the card
      className="relative"
    >
      {/* One-shot card shake, fired per tap */}
      <motion.div
        animate={
          isShaking && !reduce
            ? { x: [0, -6, 6, -4, 4, -2, 0], rotate: [0, -0.6, 0.6, -0.4, 0.4, 0] }
            : { x: 0, rotate: 0 }
        }
        transition={{ duration: 0.42, ease: 'easeInOut' }}
        className="relative"
      >
        <SpotlightCard className="h-full border border-slate-200 bg-white p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg">
          <div
            className={
              'absolute inset-x-0 top-0 h-0.5 origin-left transition-transform duration-500 ' +
              (isBrand ? 'bg-brand-700 group-hover:scale-x-100 scale-x-0' : 'bg-slate-400 group-hover:scale-x-100 scale-x-0')
            }
          />

          <div className="relative mb-3 flex items-center gap-3">
            {/* ── Avatar: the tail's target ── */}
            <div className="relative shrink-0">
              <div
                className={
                  'flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition-transform duration-300 group-hover:scale-110 ' +
                  (isBrand
                    ? 'bg-brand-700 text-white'
                    : 'bg-slate-100 text-slate-700 group-hover:bg-slate-200')
                }
              >
                {member.initials}
              </div>
              {/* Anchor point marker for the bubble tail (invisible) */}
              <span
                aria-hidden
                data-bubble-anchor
                className="pointer-events-none absolute -top-1 left-1/2 h-1 w-1 -translate-x-1/2"
              />
            </div>

            <div className="min-w-0">
              {onTap ? (
                <>
                  <motion.button
                    type="button"
                    onClick={handleTap}
                    animate={isShaking && !reduce ? { x: [0, -4, 4, -3, 3, 0] } : { x: 0 }}
                    transition={{ duration: 0.4 }}
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

                    {!reduce && rippleKey > 0 && (
                      <motion.span
                        key={rippleKey}
                        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-400"
                        initial={{ width: 0, height: 0, opacity: 0.8 }}
                        animate={{ width: 90, height: 90, opacity: 0 }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                      />
                    )}
                  </motion.button>

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

        {/* ═══════════════════════════════════════════════════════
            Manga bubble — OUTSIDE SpotlightCard so it overlays the
            whole card. Anchored above the avatar, with a tail that
            drops down onto the avatar's top edge.
            ═══════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {activeStyle && (
            <MangaBubble
              key={messageIndex}
              message={MANGA_MESSAGES[messageIndex]}
              style={activeStyle}
              step={messageIndex + 1}
              total={MANGA_MESSAGES.length}
              reduce={reduce}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// MangaBubble — bubble sits ABOVE the card, tail drops onto
// the avatar (top-left of card, ~24px from left edge, ~24px down).
// ═══════════════════════════════════════════════════════════

function MangaBubble({
  message,
  style,
  step,
  total,
  reduce,
}: {
  message: string;
  style: {
    bg: string;
    border: string;
    text: string;
    rotate: number;
    tail: string;
    fill: string;
  };
  step: number;
  total: number;
  reduce: boolean | null;
}) {
  return (
    <motion.div
      initial={
        reduce
          ? { opacity: 0 }
          : { opacity: 0, scale: 0.4, y: 16, rotate: style.rotate - 8 }
      }
      animate={{ opacity: 1, scale: 1, y: 0, rotate: style.rotate }}
      exit={
        reduce
          ? { opacity: 0 }
          : { opacity: 0, scale: 0.85, y: -10, rotate: style.rotate + 6 }
      }
      transition={{ type: 'spring', stiffness: 520, damping: 20, mass: 0.55 }}
      // Anchored so the tail tip lands on the avatar (~x=20px, y=24px from card top-left).
      // We place the bubble ABOVE the card: bottom edge near -18px, left aligned over the avatar.
      className="pointer-events-none absolute -top-9 left-4 z-40 -translate-y-full origin-bottom-left"
      role="status"
      aria-live="polite"
    >
      <motion.div
        animate={
          reduce
            ? {}
            : {
                rotate: [
                  style.rotate,
                  style.rotate + 1.5,
                  style.rotate - 1,
                  style.rotate + 0.5,
                  style.rotate,
                ],
              }
        }
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        className="relative"
      >
        {/* Bubble body */}
        <div
          className={
            'relative inline-block max-w-[220px] border-2 px-3 py-2 ' +
            style.bg + ' ' + style.border + ' ' + style.text
          }
          style={{
            clipPath:
              'polygon(0% 8%, 4% 0%, 96% 0%, 100% 10%, 100% 92%, 96% 100%, 6% 100%, 0% 90%)',
            filter: 'drop-shadow(3px 4px 0 rgba(15, 23, 42, 0.18))',
          }}
        >
          <p className="text-[11px] font-extrabold uppercase italic leading-tight tracking-wide">
            {message}
          </p>

          {/* Step dots — 7 total, fills as you tap */}
          <div className="mt-1.5 flex items-center gap-1">
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className={
                  'h-1 w-1 transition-colors ' +
                  (i < step
                    ? style.text === 'text-white'
                      ? 'bg-white'
                      : 'bg-brand-700'
                    : style.text === 'text-white'
                      ? 'bg-white/30'
                      : 'bg-slate-300')
                }
              />
            ))}
          </div>
        </div>

        {/* Tail — drops straight down toward the avatar */}
        <svg
          aria-hidden
          width="26"
          height="26"
          viewBox="0 0 26 26"
          className="absolute -bottom-[24px] left-6"
          style={{ filter: 'drop-shadow(2px 3px 0 rgba(15, 23, 42, 0.18))' }}
        >
          {/* Outer border triangle */}
          <polygon points="0,0 22,0 8,26" className={style.tail} />
          {/* Inner fill triangle */}
          <polygon points="4,2 18,2 9,21" className={style.fill} />
        </svg>
      </motion.div>
    </motion.div>
  );
}