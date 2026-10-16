import { useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import type { TeamMember } from '../data/team';
import { SpotlightCard } from './animations';

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
  "Fine! You asked for it…",
];

const MANGA_STYLES = [
  { bg: 'bg-white',    border: 'border-slate-900', text: 'text-slate-900', rotate: -3, tail: 'fill-slate-900', fill: 'fill-white',
    cardBorder: 'border-slate-900', tint: '',             glow: 'rgba(15,23,42,0.35)',  shakeAmp: 6,  badge: '!',   badgeColor: 'text-slate-900' },
  { bg: 'bg-amber-50', border: 'border-amber-700', text: 'text-amber-900', rotate:  3, tail: 'fill-amber-700', fill: 'fill-amber-50',
    cardBorder: 'border-amber-700', tint: 'bg-amber-100/40', glow: 'rgba(180,83,9,0.45)', shakeAmp: 8,  badge: '!!',  badgeColor: 'text-amber-700' },
  { bg: 'bg-red-50',   border: 'border-red-700',   text: 'text-red-900',   rotate: -4, tail: 'fill-red-700',   fill: 'fill-red-50',
    cardBorder: 'border-red-700',   tint: 'bg-red-100/40',   glow: 'rgba(185,28,28,0.55)', shakeAmp: 10, badge: '!!',  badgeColor: 'text-red-700' },
  { bg: 'bg-white',    border: 'border-slate-900', text: 'text-slate-900', rotate:  2, tail: 'fill-slate-900', fill: 'fill-white',
    cardBorder: 'border-slate-900', tint: '',                glow: 'rgba(15,23,42,0.4)',  shakeAmp: 11, badge: '!!',  badgeColor: 'text-slate-900' },
  { bg: 'bg-orange-50',border: 'border-orange-700',text: 'text-orange-900',rotate: -3, tail: 'fill-orange-700',fill: 'fill-orange-50',
    cardBorder: 'border-orange-700',tint: 'bg-orange-100/50',glow: 'rgba(194,65,12,0.6)', shakeAmp: 12, badge: '💢',  badgeColor: 'text-orange-700' },
  { bg: 'bg-red-100',  border: 'border-red-800',   text: 'text-red-950',   rotate:  4, tail: 'fill-red-800',   fill: 'fill-red-100',
    cardBorder: 'border-red-800',   tint: 'bg-red-200/50',   glow: 'rgba(127,29,29,0.7)', shakeAmp: 14, badge: '💢',  badgeColor: 'text-red-800' },
  { bg: 'bg-brand-700',border: 'border-brand-900', text: 'text-white',     rotate: -2, tail: 'fill-brand-900', fill: 'fill-brand-700',
    cardBorder: 'border-brand-900', tint: 'bg-brand-700/15', glow: 'rgba(92,18,25,0.85)', shakeAmp: 16, badge: '💢',  badgeColor: 'text-brand-900' },
];

export function TeamCard({ member, index = 0, onTap, storeTaps }: Props) {
  const isBrand = member.accent === 'brand';
  const [tapPulseKey, setTapPulseKey] = useState(0);
  const [floatKey, setFloatKey] = useState(0);
  const [rippleKey, setRippleKey] = useState(0);
  const [impactKey, setImpactKey] = useState(0);
  const reduce = useReducedMotion();

  const messageIndex =
    storeTaps != null && storeTaps > 0 && storeTaps <= MANGA_MESSAGES.length
      ? storeTaps - 1
      : -1;

  const activeStyle =
    messageIndex >= 0 && messageIndex < MANGA_STYLES.length
      ? MANGA_STYLES[messageIndex]
      : null;

  const handleTap = useCallback(() => {
    setTapPulseKey((k) => k + 1);
    setFloatKey((k) => k + 1);
    setRippleKey((k) => k + 1);
    setImpactKey((k) => k + 1);
    onTap?.();
  }, [onTap]);

  const shakeAmp = activeStyle?.shakeAmp ?? 6;
  const shouldShake = !reduce && tapPulseKey > 0;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="relative"
    >
      {/* ═══ Card-wide shake — remounts each tap to force animation restart ═══ */}
      <motion.div
        key={`shake-${tapPulseKey}`}
        animate={
          shouldShake
            ? {
                x: [0, -shakeAmp, shakeAmp, -shakeAmp*0.8, shakeAmp*0.8, -shakeAmp*0.6, shakeAmp*0.6, -shakeAmp*0.3, shakeAmp*0.3, 0],
                y: [0, shakeAmp*0.3, -shakeAmp*0.3, shakeAmp*0.2, -shakeAmp*0.2, shakeAmp*0.1, -shakeAmp*0.1, 0],
                rotate: [0, -shakeAmp*0.15, shakeAmp*0.15, -shakeAmp*0.12, shakeAmp*0.12, -shakeAmp*0.06, shakeAmp*0.06, 0],
              }
            : { x: 0, y: 0, rotate: 0 }
        }
        transition={{ duration: shouldShake ? 0.5 : 0.25, ease: 'easeInOut' }}
        className="relative"
        style={{ willChange: 'transform' }}
      >
        {/* ═══ GLOW HALO — sibling BEFORE the card, no negative z-index ═══
            Now visible because:
            - It lives outside SpotlightCard (not clipped by overflow-hidden)
            - It sits behind the card in normal flow order
            - No -z-10 pushing it behind the page background */}
        {activeStyle && !reduce && (
          <motion.div
            key={`glow-${messageIndex}`}
            aria-hidden
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: [0.7, 1, 0.7], scale: [1, 1.04, 1] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            className="pointer-events-none absolute -inset-3"
            style={{
              background: `radial-gradient(ellipse at center, ${activeStyle.glow} 0%, transparent 70%)`,
              filter: 'blur(14px)',
              zIndex: 0,   // sits above page bg, below the card (card uses position: relative + z-1 implicitly)
            }}
          />
        )}

        {/* ═══ CARD — wrapped so the hard shadow shows on the OUTSIDE ═══ */}
        <div className="relative z-10">
          {/* Comic hard shadow — applied to a wrapper that's NOT overflow-hidden */}
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
                  boxShadow: activeStyle.glow.replace('0.85', '0.9').replace('0.75', '0.85').replace('0.7', '0.8').replace('0.6', '0.7').replace('0.55', '0.65').replace('0.45', '0.55').replace('0.35', '0.45'),
                  // That ugly replace chain is just turning the rgba alpha up a bit.
                  // Simpler: define a separate `cardShadow` string per style, e.g.
                  // cardShadow: '6px 6px 0 rgba(15, 23, 42, 0.85)',
                  // and use `boxShadow: activeStyle.cardShadow`. See note below.
                  transform: 'translate(4px, 4px)',
                }}
              />
            )}
          </AnimatePresence>

          <SpotlightCard
            className={
              'relative h-full bg-white p-4 transition-[border-color] duration-300 ' +
              (activeStyle
                ? activeStyle.cardBorder + ' '         // ⬅️ border color shift
                : 'border border-slate-200 hover:-translate-y-0.5 hover:border-brand-300')
            }
          >
            {/* ── Card tint overlay ── */}
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

            {/* ── Radial impact ripple from card center ── */}
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
                    background: `radial-gradient(circle, ${activeStyle?.glow ?? 'rgba(92,18,25,0.5)'} 0%, transparent 70%)`,
                  }}
                />
              </motion.div>
            )}

            {/* ── Anger badge — top-right ── */}
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

            {/* ── Top accent bar ── */}
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
                  : (isBrand ? 'bg-brand-700 group-hover:scale-x-100 scale-x-0'
                             : 'bg-slate-400 group-hover:scale-x-100 scale-x-0'))
              }
            />

            {/* ── Bottom pulse stripes (high intensity only) ── */}
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
              {/* ── Avatar pulse ── */}
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
                    ? messageIndex >= 6 ? 'bg-brand-900 text-white'
                    : messageIndex >= 5 ? 'bg-red-800 text-white'
                    : messageIndex >= 3 ? 'bg-orange-600 text-white'
                    : messageIndex >= 1 ? 'bg-amber-600 text-white'
                    : 'bg-slate-900 text-white'
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

        {/* ═══ Manga bubble — overlaps the card ═══ */}
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
// MangaBubble
// ═══════════════════════════════════════════════════════════

function MangaBubble({
  message, style, step, total, reduce,
}: {
  message: string;
  style: { bg: string; border: string; text: string; rotate: number; tail: string; fill: string; glow: string };
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