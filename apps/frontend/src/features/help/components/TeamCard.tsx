import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import type { TeamMember } from '../data/team';
import { SpotlightCard } from './animations';
import { sfx } from '../lib/sfx';

interface Props {
  member: TeamMember;
  index?: number;
  onTap?: () => void;
  storeTaps?: number;
}

const MANGA_MESSAGES: string[] = [
  "Hey! Don't touch that!",
  'Wag NGANI!!!?',
  'Are you serious right now?',
  'This is NOT a button!',
  'One more tap and I swear…',
  'Okay, seriously, cut it out!',
  'Fine! You asked for it…',
];

interface MangaStyle {
  bg: string;
  border: string;
  text: string;
  rotate: number;
  tail: string;
  fill: string;
  glow: string;
  cardBorder: string;
  tint: string;
  shakeAmp: number;
  badge: string;
  badgeColor: string;
  cardShadow: string;
  lineColor: string;
  avatarBg: string;
}

const MANGA_STYLES: MangaStyle[] = [
  {
    bg: 'bg-white', border: 'border-slate-900', text: 'text-slate-900', rotate: -3,
    tail: 'fill-slate-900', fill: 'fill-white',
    cardBorder: 'border-slate-900', tint: '', glow: 'rgba(15,23,42,0.35)',
    shakeAmp: 6, badge: '!', badgeColor: 'text-slate-900',
    cardShadow: '5px 5px 0 rgba(15, 23, 42, 0.75)',
    lineColor: '#0f172a', avatarBg: 'bg-slate-900',
  },
  {
    bg: 'bg-amber-50', border: 'border-amber-700', text: 'text-amber-900', rotate: 3,
    tail: 'fill-amber-700', fill: 'fill-amber-50',
    cardBorder: 'border-amber-700', tint: 'bg-amber-100/40', glow: 'rgba(180,83,9,0.45)',
    shakeAmp: 8, badge: '!!', badgeColor: 'text-amber-700',
    cardShadow: '6px 6px 0 rgba(180, 83, 9, 0.8)',
    lineColor: '#b45309', avatarBg: 'bg-amber-600',
  },
  {
    bg: 'bg-red-50', border: 'border-red-700', text: 'text-red-900', rotate: -4,
    tail: 'fill-red-700', fill: 'fill-red-50',
    cardBorder: 'border-red-700', tint: 'bg-red-100/40', glow: 'rgba(185,28,28,0.55)',
    shakeAmp: 10, badge: '!!', badgeColor: 'text-red-700',
    cardShadow: '7px 7px 0 rgba(185, 28, 28, 0.85)',
    lineColor: '#b91c1c', avatarBg: 'bg-red-700',
  },
  {
    bg: 'bg-white', border: 'border-slate-900', text: 'text-slate-900', rotate: 2,
    tail: 'fill-slate-900', fill: 'fill-white',
    cardBorder: 'border-slate-900', tint: '', glow: 'rgba(15,23,42,0.4)',
    shakeAmp: 11, badge: '!!', badgeColor: 'text-slate-900',
    cardShadow: '7px 7px 0 rgba(15, 23, 42, 0.85)',
    lineColor: '#0f172a', avatarBg: 'bg-slate-900',
  },
  {
    bg: 'bg-orange-50', border: 'border-orange-700', text: 'text-orange-900', rotate: -3,
    tail: 'fill-orange-700', fill: 'fill-orange-50',
    cardBorder: 'border-orange-700', tint: 'bg-orange-100/50', glow: 'rgba(194,65,12,0.6)',
    shakeAmp: 12, badge: '💢', badgeColor: 'text-orange-700',
    cardShadow: '8px 8px 0 rgba(194, 65, 12, 0.9)',
    lineColor: '#c2410c', avatarBg: 'bg-orange-600',
  },
  {
    bg: 'bg-red-100', border: 'border-red-800', text: 'text-red-950', rotate: 4,
    tail: 'fill-red-800', fill: 'fill-red-100',
    cardBorder: 'border-red-800', tint: 'bg-red-200/50', glow: 'rgba(127,29,29,0.7)',
    shakeAmp: 14, badge: '💢', badgeColor: 'text-red-800',
    cardShadow: '9px 9px 0 rgba(127, 29, 29, 0.9)',
    lineColor: '#991b1b', avatarBg: 'bg-red-800',
  },
  {
    bg: 'bg-brand-700', border: 'border-brand-900', text: 'text-white', rotate: -2,
    tail: 'fill-brand-900', fill: 'fill-brand-700',
    cardBorder: 'border-brand-900', tint: 'bg-brand-700/15', glow: 'rgba(92,18,25,0.85)',
    shakeAmp: 16, badge: '💢', badgeColor: 'text-brand-900',
    cardShadow: '10px 10px 0 rgba(92, 18, 25, 0.95)',
    lineColor: '#5c1219', avatarBg: 'bg-brand-900',
  },
];

/** How long (ms) the card waits after the last tap before resetting. */
const IDLE_RESET_MS = 3000;

export function TeamCard({ member, index = 0, onTap, storeTaps }: Props) {
  const lastStageRef = useRef(-1);
  const isBrand = member.accent === 'brand';
  const [tapPulseKey, setTapPulseKey] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [rippleKey, setRippleKey] = useState(0);
  const [impactKey, setImpactKey] = useState(0);
  const [localTaps, setLocalTaps] = useState(0);

  // Idle-reset: after 3s of no taps, revert to stage 0 (no manga).
  const idleTimerRef = useRef<number | null>(null);

  const prefersReduced = useReducedMotion();
  const softMotion = prefersReduced === true;
  const reduce = false;

  const effectiveTaps = storeTaps != null && storeTaps > 0 ? storeTaps : localTaps;

  const messageIndex =
    effectiveTaps > 0
      ? Math.min(effectiveTaps, MANGA_MESSAGES.length) - 1
      : -1;

  const activeStyle =
    messageIndex >= 0 && messageIndex < MANGA_STYLES.length
      ? MANGA_STYLES[messageIndex]
      : null;

  // Cleanup idle timer on unmount
  useEffect(() => {
    return () => {
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
      }
    };
  }, []);

  const handleTap = useCallback(() => {
    sfx.init();
    
    setLocalTaps((t) => t + 1);
    setTapPulseKey((k) => k + 1);
    setFloatKey((k) => k + 1);
    setRippleKey((k) => k + 1);
    setImpactKey((k) => k + 1);
    onTap?.();

    // Reset the idle timer — every tap restarts the 3s countdown
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = window.setTimeout(() => {
      setLocalTaps(0);
      setTapPulseKey(0);
      setImpactKey(0);
      setFloatKey(0);
      setRippleKey(0);
      idleTimerRef.current = null;
    }, IDLE_RESET_MS);
  }, [onTap]);

  useEffect(() => {
  if (messageIndex < 0) {
    lastStageRef.current = -1;
    return;
  }
  if (messageIndex === lastStageRef.current) return;
  lastStageRef.current = messageIndex;

  // Stage-specific SFX
  if (messageIndex >= 6)      sfx.rage();
  else if (messageIndex >= 4) sfx.impact();
  else if (messageIndex >= 2) sfx.angry();
  else                        sfx.pop();
}, [messageIndex]);
  const shakeAmp = activeStyle?.shakeAmp ?? 6;
  const shouldShake = tapPulseKey > 0;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="relative"
    >
      {/* ═══ Card-wide shake ═══ */}
      <motion.div
        key={`shake-${tapPulseKey}`}
        animate={
          shouldShake
            ? {
                x: [
                  0, -shakeAmp, shakeAmp * 0.9, -shakeAmp * 0.7,
                  shakeAmp * 0.6, -shakeAmp * 0.4, shakeAmp * 0.2, 0,
                ],
                y: [
                  0, shakeAmp * 0.4, -shakeAmp * 0.5, shakeAmp * 0.35,
                  -shakeAmp * 0.25, shakeAmp * 0.15, 0,
                ],
                rotate: [
                  0, -shakeAmp * 0.2, shakeAmp * 0.18, -shakeAmp * 0.14,
                  shakeAmp * 0.1, -shakeAmp * 0.05, 0,
                ],
                scale: [1, 1.06, 0.96, 1.03, 0.98, 1.01, 1],
              }
            : { x: 0, y: 0, rotate: 0, scale: 1 }
        }
        transition={{
          duration: shouldShake ? 0.55 : 0.25,
          ease: [0.36, 0.07, 0.19, 0.97],
        }}
        className="relative"
        style={{ willChange: 'transform' }}
      >
        {/* ═══ GLOW HALO ═══ */}
        {activeStyle && !reduce && (
          <motion.div
            key={`glow-${messageIndex}`}
            aria-hidden
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: [0.7, 1, 0.7], scale: [1, 1.04, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            className="pointer-events-none absolute -inset-3"
            style={{
              background: `radial-gradient(ellipse at center, ${activeStyle.glow} 0%, transparent 70%)`,
              filter: 'blur(14px)',
              zIndex: 0,
            }}
          />
        )}

        {/* ═══ SPEED LINES — anchored to the UPPER-LEFT corner ═══
            - The SVG's own viewBox is centered at (0,0), spanning -100..100.
            - We position the SVG so its center sits at the card's top-left
              corner, then bias the radiating lines toward the bottom-right
              of the SVG so they fan *into* the card (classic manga impact).
        */}
        <AnimatePresence>
          {activeStyle && !reduce && (
            <motion.svg
              key={`speedlines-${messageIndex}`}
              aria-hidden
              viewBox="-100 -100 200 200"
              className="pointer-events-none absolute -left-8 -top-8 h-[200%] w-[200%]"
              style={{ zIndex: 0, overflow: 'visible' }}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: [0, 1, 0.75], scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            >
              {Array.from({ length: 20 }).map((_, i) => {
                // Fan the lines across a 90° arc pointing toward
                // bottom-right (the interior of the card).
                const spread = Math.PI / 2;               // 90° total
                const a = -Math.PI / 4 + (i / 19) * spread; // -45° .. +45°
                const x1 = Math.cos(a) * 55;
                const y1 = Math.sin(a) * 55;
                const x2 = Math.cos(a) * 100;
                const y2 = Math.sin(a) * 100;
                return (
                  <motion.line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={activeStyle.lineColor}
                    strokeWidth={2}
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: [0, 1, 0.4] }}
                    transition={{
                      duration: 0.4,
                      delay: i * 0.012,
                      ease: 'easeOut',
                    }}
                  />
                );
              })}
            </motion.svg>
          )}
        </AnimatePresence>

        {/* ═══ Emoji burst ═══ */}
        {!reduce && impactKey > 0 && (
          <div
            key={`burst-${impactKey}`}
            className="pointer-events-none absolute left-1/2 top-1/2 z-40"
            aria-hidden
          >
            {['💥', '⚡', '💢', '✨'].map((emoji, i) => (
              <motion.span
                key={`${impactKey}-${i}`}
                initial={{ opacity: 1, x: 0, y: 0, scale: 0.4 }}
                animate={{
                  opacity: 0,
                  x: Math.cos((i / 4) * Math.PI * 2) * 80,
                  y: Math.sin((i / 4) * Math.PI * 2) * 80,
                  scale: 1.8,
                  rotate: (i % 2 ? 1 : -1) * 90,
                }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                className="absolute -translate-x-1/2 -translate-y-1/2 text-2xl"
              >
                {emoji}
              </motion.span>
            ))}
          </div>
        )}

        {/* ═══ CARD ═══ */}
        <div className="relative z-10">
          <AnimatePresence>
            {activeStyle && (
              <motion.div
                key={`shadow-${messageIndex}`}
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="pointer-events-none absolute inset-0"
                style={{
                  boxShadow: activeStyle.cardShadow,
                  transform: 'translate(4px, 4px)',
                }}
              />
            )}
          </AnimatePresence>

          <SpotlightCard
            className={
              'relative h-full bg-white p-4 transition-[border-color] duration-300 ' +
              (activeStyle
                ? activeStyle.cardBorder + ' '
                : 'border border-slate-200 hover:-translate-y-0.5 hover:border-brand-300')
            }
          >
            {/* Card tint overlay */}
            <AnimatePresence>
              {activeStyle?.tint && (
                <motion.div
                  key={`tint-${messageIndex}`}
                  aria-hidden
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className={'pointer-events-none absolute inset-0 ' + activeStyle.tint}
                />
              )}
            </AnimatePresence>

            {/* Radial impact ripple */}
            {!reduce && impactKey > 0 && (
              <motion.div
                key={`impact-${impactKey}`}
                aria-hidden
                className="pointer-events-none absolute inset-0 overflow-hidden"
              >
                <motion.div
                  initial={{ scale: 0, opacity: 0.6 }}
                  animate={{ scale: 3, opacity: 0 }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                  className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    background: `radial-gradient(circle, ${
                      activeStyle?.glow ?? 'rgba(92,18,25,0.5)'
                    } 0%, transparent 70%)`,
                  }}
                />
              </motion.div>
            )}

            {/* Impact flash */}
            <AnimatePresence>
              {activeStyle && impactKey > 0 && !reduce && (
                <motion.div
                  key={`flash-${impactKey}`}
                  aria-hidden
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.6, 0] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.32, ease: 'easeOut' }}
                  className="pointer-events-none absolute inset-0 z-40"
                  style={{
                    background:
                      messageIndex >= 5
                        ? 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(92,18,25,0.55) 40%, transparent 75%)'
                        : 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, transparent 70%)',
                    mixBlendMode: 'screen',
                  }}
                />
              )}
            </AnimatePresence>

            {/* Anger badge */}
            <AnimatePresence>
              {activeStyle && !reduce && (
                <motion.div
                  key={`badge-${messageIndex}`}
                  aria-hidden
                  initial={{ opacity: 0, scale: 0.4, rotate: -20 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    rotate: messageIndex >= 4 ? [0, -10, 10, -10, 0] : 0,
                  }}
                  exit={{ opacity: 0, scale: 0.4 }}
                  transition={{
                    duration: messageIndex >= 4 ? 0.9 : 0.3,
                    repeat: messageIndex >= 4 ? Infinity : 0,
                    ease: 'easeInOut',
                  }}
                  className="pointer-events-none absolute right-1 top-1 z-30 flex h-8 w-8 items-center justify-center"
                >
                  <span
                    className={'text-[22px] font-black leading-none ' + activeStyle.badgeColor}
                    style={{ textShadow: `0 0 10px ${activeStyle.glow}, 0 0 4px white` }}
                  >
                    {activeStyle.badge}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Top accent bar */}
            <div
              className={
                'absolute inset-x-0 top-0 h-0.5 origin-left transition-transform duration-500 ' +
                (activeStyle
                  ? 'scale-x-100 ' +
                    (messageIndex >= 6 ? 'bg-brand-900'
                     : messageIndex >= 5 ? 'bg-red-800'
                     : messageIndex >= 3 ? 'bg-orange-600'
                     : messageIndex >= 1 ? 'bg-amber-600'
                     : 'bg-slate-900')
                  : isBrand ? 'bg-brand-700 group-hover:scale-x-100 scale-x-0'
                            : 'bg-slate-400 group-hover:scale-x-100 scale-x-0')
              }
            />

            {/* Bottom pulse stripes */}
            <AnimatePresence>
              {activeStyle && messageIndex >= 5 && !reduce && (
                <motion.div
                  key={`stripes-${messageIndex}`}
                  aria-hidden
                  initial={{ opacity: 0, scaleX: 0.6 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  exit={{ opacity: 0, scaleX: 0.6 }}
                  transition={{ duration: 0.3 }}
                  className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 flex h-1"
                >
                  {Array.from({ length: 14 }).map((_, i) => (
                    <motion.span
                      key={i}
                      animate={{ opacity: [0.35, 1, 0.35] }}
                      transition={{
                        duration: 0.9,
                        repeat: Infinity,
                        delay: i * 0.05,
                        ease: 'easeInOut',
                      }}
                      className={'h-full flex-1 ' + (messageIndex >= 6 ? 'bg-brand-900' : 'bg-red-800')}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative mb-3 flex items-center gap-3">
              <motion.div
                animate={
                  activeStyle && !reduce
                    ? {
                        scale: [1, 1.12, 1],
                        boxShadow: `0 0 0 3px ${activeStyle.glow}, 0 0 16px ${activeStyle.glow}`,
                      }
                    : {}
                }
                transition={{
                  duration: 0.7,
                  repeat: activeStyle ? Infinity : 0,
                  ease: 'easeInOut',
                }}
                className={
                  'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-transform duration-300 group-hover:scale-110 ' +
                  (activeStyle
                    ? activeStyle.avatarBg + ' text-white'
                    : isBrand ? 'bg-brand-700 text-white'
                             : 'bg-slate-100 text-slate-700 group-hover:bg-slate-200')
                }
              >
                {member.initials}
              </motion.div>

              <div className="min-w-0">
                {onTap ? (
                  <motion.button
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
                ) : (
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {member.name}
                  </div>
                )}
                <div className="truncate text-xs text-slate-500">{member.role}</div>
              </div>
            </div>

            <p className="relative text-xs leading-relaxed text-slate-600">{member.focus}</p>

            {member.email && (
              <a
                href={`mailto:${member.email}`}
                onClick={(e) => e.stopPropagation()}
                className="relative mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-700 transition-colors hover:text-brand-800"
              >
                <span className="material-symbols-outlined text-[14px]">mail</span>
                {member.email}
              </a>
            )}
          </SpotlightCard>
        </div>

        {/* Manga bubble */}
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

function MangaBubble({
  message, style, step, total, reduce,
}: {
  message: string;
  style: MangaStyle;
  step: number;
  total: number;
  reduce: boolean | null;
}) {
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4, y: 16, rotate: style.rotate - 8 }}
      animate={{ opacity: 1, scale: 1, y: 0, rotate: style.rotate }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: -10, rotate: style.rotate + 6 }}
      transition={{ type: 'spring', stiffness: 520, damping: 20, mass: 0.55 }}
      className="pointer-events-none absolute -top-9 left-4 z-50 -translate-y-full origin-bottom-left"
      role="status"
      aria-live="polite"
    >
      <motion.div
        animate={reduce ? {} : {
          rotate: [style.rotate, style.rotate + 1.5, style.rotate - 1, style.rotate + 0.5, style.rotate],
        }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        className="relative"
      >
        <div
          className={'relative inline-block max-w-[220px] border-2 px-3 py-2 ' + style.bg + ' ' + style.border + ' ' + style.text}
          style={{
            clipPath: 'polygon(0% 8%, 4% 0%, 96% 0%, 100% 10%, 100% 92%, 96% 100%, 6% 100%, 0% 90%)',
            filter: `drop-shadow(3px 4px 0 rgba(15, 23, 42, 0.25)) drop-shadow(0 0 14px ${style.glow})`,
          }}
        >
          <p className="text-[11px] font-extrabold uppercase italic leading-tight tracking-wide">{message}</p>
          <div className="mt-1.5 flex items-center gap-1">
            {Array.from({ length: total }).map((_, i) => (
              <span key={i} className={
                'h-1 w-1 transition-colors ' +
                (i < step ? (style.text === 'text-white' ? 'bg-white' : 'bg-brand-700')
                          : (style.text === 'text-white' ? 'bg-white/30' : 'bg-slate-300'))
              } />
            ))}
          </div>
        </div>

        <svg aria-hidden width="26" height="26" viewBox="0 0 26 26"
          className="absolute -bottom-[24px] left-6"
          style={{ filter: `drop-shadow(2px 3px 0 rgba(15, 23, 42, 0.25)) drop-shadow(0 0 8px ${style.glow})` }}
        >
          <polygon points="0,0 22,0 8,26" className={style.tail} />
          <polygon points="4,2 18,2 9,21" className={style.fill} />
        </svg>
      </motion.div>
    </motion.div>
  );
}