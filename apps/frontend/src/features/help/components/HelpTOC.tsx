import { motion, useReducedMotion } from 'motion/react';

interface Section {
  id: string;
  label: string;
}

interface Props {
  sections: Section[];
  activeId: string;
  className?: string;
}

export function HelpTOC({ sections, activeId, className = '' }: Props) {
  const reduce = useReducedMotion();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <nav className={className} aria-label="Help sections">
      {/* Desktop */}
      <div className="hidden border border-slate-200 bg-white p-4 lg:block">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          On this page
        </div>
        <ul className="space-y-1">
          {sections.map((s, i) => {
            const active = activeId === s.id;
            return (
              <motion.li
                key={s.id}
                initial={reduce ? false : { opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: i * 0.04 }}
              >
                <a
                  href={`#${s.id}`}
                  onClick={(e) => handleClick(e, s.id)}
                  className="relative block px-3 py-1.5 text-sm transition-colors"
                >
                  {active && (
                    <motion.span
                      layoutId="toc-active"
                      className="absolute inset-0 border-l-2 border-brand-700 bg-brand-50"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span
                    className={
                      'relative block transition-all duration-200 ' +
                      (active
                        ? 'font-medium text-brand-800'
                        : 'text-slate-600 hover:pl-1 hover:text-slate-900')
                    }
                  >
                    {s.label}
                  </span>
                </a>
              </motion.li>
            );
          })}
        </ul>
      </div>

      {/* Mobile */}
      <div className="fade-edge-x flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {sections.map((s) => {
          const active = activeId === s.id;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => handleClick(e, s.id)}
              className={
                'relative shrink-0 border px-3 py-1.5 text-xs transition-colors ' +
                (active
                  ? 'border-brand-700 bg-brand-700 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')
              }
            >
              {s.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}