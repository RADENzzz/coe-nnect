import {
  motion,
  useMotionValue,
  useSpring,
  useReducedMotion,
  AnimatePresence,
  type MotionProps,
} from 'motion/react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

/* ═══════════════════════════════════════════════
   Reveal — fade-up on scroll into view
   ═══════════════════════════════════════════════ */
export function Reveal({
  children,
  delay = 0,
  y = 16,
  className = '',
  once = true,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  once?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-80px' }}
      transition={{ duration: 0.5, delay, ease: [0.2, 0.9, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════
   Stagger — parent that orchestrates children
   ═══════════════════════════════════════════════ */
export function Stagger({
  children,
  className = '',
  step = 0.06,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  step?: number;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren: reduce ? 0 : step,
            delayChildren: delay,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export const staggerItem = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.2, 0.9, 0.3, 1] as const },
  },
};

export function StaggerItem({
  children,
  className = '',
  ...rest
}: { children: ReactNode; className?: string } & MotionProps) {
  return (
    <motion.div className={className} variants={staggerItem} {...rest}>
      {children}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════
   SpotlightCard — radial gradient follows cursor
   (Hover.dev signature)
   ═══════════════════════════════════════════════ */
export function SpotlightCard({
  children,
  className = '',
  spotColor = 'rgba(92, 18, 25, 0.08)',
  radius = 380,
}: {
  children: ReactNode;
  className?: string;
  spotColor?: string;
  radius?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [hovering, setHovering] = useState(false);

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      x.set(e.clientX - r.left);
      y.set(e.clientY - r.top);
    },
    [x, y],
  );

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={`group relative overflow-hidden ${className}`}
      style={
        {
          '--spot-x': x,
          '--spot-y': y,
        } as CSSProperties
      }
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(${radius}px circle at var(--spot-x) var(--spot-y), ${spotColor}, transparent 55%)`,
        }}
        animate={{ opacity: hovering ? 1 : 0 }}
        transition={{ duration: 0.25 }}
      />
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Magnetic — element pulls toward cursor
   ═══════════════════════════════════════════════ */
export function Magnetic({
  children,
  strength = 0.25,
  className = '',
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(0, { stiffness: 260, damping: 22, mass: 0.4 });
  const y = useSpring(0, { stiffness: 260, damping: 22, mass: 0.4 });

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ x, y }}
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        x.set((e.clientX - r.left - r.width / 2) * strength);
        y.set((e.clientY - r.top - r.height / 2) * strength);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════
   ShimmerText — animated gradient headline
   ═══════════════════════════════════════════════ */
export function ShimmerText({
  children,
  className = '',
  colors = ['#0f172a', '#5c1219', '#dc2626', '#5c1219', '#0f172a'],
  duration = 6,
}: {
  children: ReactNode;
  className?: string;
  colors?: string[];
  duration?: number;
}) {
  const reduce = useReducedMotion();
  const grad = `linear-gradient(90deg, ${colors.join(', ')})`;
  if (reduce) return <span className={className}>{children}</span>;
  return (
    <motion.span
      className={`inline-block bg-clip-text text-transparent ${className}`}
      style={{ backgroundImage: grad, backgroundSize: '200% 100%' }}
      animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
      transition={{ duration, repeat: Infinity, ease: 'linear' }}
    >
      {children}
    </motion.span>
  );
}

/* ═══════════════════════════════════════════════
   GradientBorder — rotating conic border
   ═══════════════════════════════════════════════ */
export function GradientBorder({
  children,
  className = '',
  duration = 8,
  active = true,
}: {
  children: ReactNode;
  className?: string;
  duration?: number;
  active?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <div className={`relative ${className}`}>
      <motion.div
        aria-hidden
        className="absolute -inset-[1px]"
        style={{
          background:
            'conic-gradient(from 0deg, #5c1219, #dc2626, #f59e0b, #dc2626, #5c1219)',
          filter: 'blur(0.5px)',
        }}
        animate={active && !reduce ? { rotate: 360 } : undefined}
        transition={{ duration, repeat: Infinity, ease: 'linear' }}
      />
      <div className="relative bg-white">{children}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Tilt3D — perspective tilt on hover
   ═══════════════════════════════════════════════ */
export function Tilt3D({
  children,
  className = '',
  max = 8,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const rx = useSpring(0, { stiffness: 220, damping: 20 });
  const ry = useSpring(0, { stiffness: 220, damping: 20 });

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        ry.set(px * max * 2);
        rx.set(-py * max * 2);
      }}
      onMouseLeave={() => {
        rx.set(0);
        ry.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════
   ScrollProgress — top-of-page reading bar
   ═══════════════════════════════════════════════ */
export function ScrollProgress() {
  const scaleX = useSpring(0, { stiffness: 140, damping: 22 });
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      scaleX.set(max > 0 ? h.scrollTop / max : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [scaleX]);

  return (
    <motion.div
      aria-hidden
      className="fixed left-0 right-0 top-0 z-[100] h-0.5 origin-left bg-brand-700"
      style={{ scaleX }}
    />
  );
}

/* ═══════════════════════════════════════════════
   BackToTop — floating scroll-to-top button
   ═══════════════════════════════════════════════ */
export function BackToTop({ threshold = 480 }: { threshold?: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          type="button"
          aria-label="Back to top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          initial={{ opacity: 0, scale: 0.6, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6, y: 12 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          className="fixed bottom-6 right-6 z-[90] flex h-11 w-11 items-center justify-center border border-brand-700 bg-brand-700 text-white shadow-lg hover:bg-brand-800"
        >
          <span className="material-symbols-outlined text-[20px]">
            arrow_upward
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

/* ═══════════════════════════════════════════════
   Accordion — Motion-based, replaces duplicated
   grid-rows tricks in FAQ + Troubleshooting
   ═══════════════════════════════════════════════ */
export function AccordionItem({
  open,
  onToggle,
  header,
  children,
  className = '',
  accent = 'brand',
}: {
  open: boolean;
  onToggle: () => void;
  header: ReactNode;
  children: ReactNode;
  className?: string;
  accent?: 'brand' | 'amber';
}) {
  const reduce = useReducedMotion();
  return (
    <div className={className}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-slate-50"
      >
        {header}
        <motion.span
          className={`material-symbols-outlined text-[20px] text-slate-400 transition-colors group-hover:text-${accent}-700`}
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: reduce ? 0 : 0.28, ease: [0.2, 0.9, 0.3, 1] }}
        >
          expand_more
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.2, 0.9, 0.3, 1] }}
            className="overflow-hidden border-t border-slate-100 bg-slate-50"
          >
            <div className="px-4 py-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}