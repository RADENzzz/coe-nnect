import { useEffect, useRef, useState } from 'react';

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

  return (
    <article
      ref={ref}
      className="group animate-fade-up overflow-hidden border border-slate-200 bg-white transition-all duration-300 hover:-translate-y-1 hover:border-brand-300 hover:shadow-xl"
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

      <div className="relative aspect-video w-full overflow-hidden bg-slate-50">
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
          </>
        )}
      </div>

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
    </article>
  );
}