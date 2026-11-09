import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Tilt3D } from './animations';
import {
  WalkthroughPreview,
  type WalkthroughCategory,
} from './WalkthroughPreview';

interface Props {
  title: string;
  gif: string;
  steps: string[];
  duration?: string;
  category: WalkthroughCategory;
}

export function GifCard({ title, gif, steps, duration, category }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [errored, setErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) =>
      event.key === 'Escape' && setLightbox(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const showPreview = errored || !gif;

  return (
    <>
      <Tilt3D className="h-full" max={5}>
        <motion.article
          ref={ref}
          initial={reduce ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5 }}
          className="group flex h-full flex-col overflow-hidden border border-outline-variant bg-surface transition-colors duration-300 hover:border-primary/40 hover:shadow-xl"
        >
          <div className="border-b border-outline-variant px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
              <div className="flex shrink-0 items-center gap-1.5">
                {duration && (
                  <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-on-surface-variant transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                    {duration}
                  </span>
                )}
                <span className="rounded-full border border-outline-variant px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">
                  {showPreview ? 'Preview' : 'GIF'}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => loaded && !errored && setLightbox(true)}
            className={`relative aspect-video w-full overflow-hidden ${
              loaded && !errored ? 'bg-slate-900' : 'bg-surface-container-low'
            }`}
            aria-label={
              loaded && !errored
                ? `View ${title} fullscreen`
                : `${title} animated preview`
            }
          >
            {!visible ? (
              <div className="animate-shimmer h-full w-full" />
            ) : showPreview ? (
              <WalkthroughPreview
                title={title}
                category={category}
                steps={steps}
              />
            ) : (
              <>
                {!loaded && <div className="animate-shimmer absolute inset-0" />}
                <img
                  src={gif}
                  alt={`${title} walkthrough`}
                  loading="lazy"
                  onLoad={() => setLoaded(true)}
                  onError={() => setErrored(true)}
                  className={`h-full w-full object-cover transition-all duration-500 ${
                    loaded
                      ? 'scale-100 opacity-100 group-hover:scale-105'
                      : 'scale-105 opacity-0'
                  }`}
                />
                {loaded && (
                  <span className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="material-symbols-outlined text-[12px]">
                      zoom_in
                    </span>
                    Expand
                  </span>
                )}
              </>
            )}
          </button>

          <ol className="space-y-2 px-4 py-4 text-sm text-on-surface-variant">
            {steps.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary transition-transform duration-200 group-hover:scale-110">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </motion.article>
      </Tilt3D>

      <AnimatePresence>
        {lightbox && (
          <motion.div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(false)}
          >
            <motion.div
              className="relative max-h-full max-w-5xl"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
              onClick={(event) => event.stopPropagation()}
            >
              <img
                src={gif}
                alt={title}
                className="max-h-[80vh] w-auto border border-white/10"
              />
              <div className="mt-3 text-center text-sm text-white/90">
                {title}
              </div>
              <button
                type="button"
                onClick={() => setLightbox(false)}
                aria-label="Close"
                className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center border border-white/20 bg-black/70 text-white transition-colors hover:bg-black"
              >
                <span className="material-symbols-outlined text-[18px]">
                  close
                </span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
