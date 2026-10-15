import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Tilt3D } from './animations';

interface Props {
  title: string;
  gif: string;
  steps: string[];
  duration?: string;
}

export function GifCard({ title, gif, steps, duration }: Props) {
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
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setLightbox(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  return (
    <>
      <Tilt3D className="h-full" max={5}>
        <motion.article
          ref={ref}
          initial={reduce ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5 }}
          className="group flex h-full flex-col overflow-hidden border border-slate-200 bg-white transition-colors duration-300 hover:border-brand-300 hover:shadow-xl"
        >
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
              {duration && (
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-600 transition-colors group-hover:bg-brand-100 group-hover:text-brand-800">
                  {duration}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => loaded && !errored && setLightbox(true)}
            className="relative aspect-video w-full overflow-hidden bg-slate-50"
            aria-label={`View ${title} fullscreen`}
          >
            {!visible ? (
              <div className="animate-shimmer h-full w-full" />
            ) : errored ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-slate-400">
                <span className="material-symbols-outlined text-2xl">
                  broken_image
                </span>
                <span>GIF not available yet</span>
              </div>
            ) : (
              <>
                {!loaded && <div className="animate-shimmer absolute inset-0" />}
                <img
                  src={gif}
                  alt={`${title} walkthrough`}
                  loading="lazy"
                  onLoad={() => setLoaded(true)}
                  onError={() => setErrored(true)}
                  className={
                    'h-full w-full object-cover transition-all duration-500 ' +
                    (loaded
                      ? 'scale-100 opacity-100 group-hover:scale-105'
                      : 'scale-105 opacity-0')
                  }
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

          <ol className="space-y-2 px-4 py-4 text-sm text-slate-700">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-800 transition-transform duration-200 group-hover:scale-110">
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
              onClick={(e) => e.stopPropagation()}
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