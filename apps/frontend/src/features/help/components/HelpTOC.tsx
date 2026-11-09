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

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <nav className={className} aria-label="Help sections">
      {/* Desktop */}
      <div className="hidden border border-outline-variant bg-surface p-4 lg:block">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
          On this page
        </div>
        <ul className="space-y-1">
          {sections.map((section, index) => {
            const active = activeId === section.id;
            return (
              <motion.li
                key={section.id}
                initial={reduce ? false : { opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: index * 0.04 }}
              >
                <a
                  href={`#${section.id}`}
                  onClick={(event) => handleClick(event, section.id)}
                  className="relative block px-3 py-1.5 text-sm transition-colors"
                >
                  {active && (
                    <motion.span
                      layoutId="toc-active"
                      className="absolute inset-0 border-l-2 border-primary bg-primary/[0.06]"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span
                    className={`relative block transition-all duration-200 ${
                      active
                        ? 'font-medium text-primary'
                        : 'text-on-surface-variant hover:pl-1 hover:text-on-surface'
                    }`}
                  >
                    {section.label}
                  </span>
                </a>
              </motion.li>
            );
          })}
        </ul>
      </div>

      {/* Mobile */}
      <div className="fade-edge-x flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {sections.map((section) => {
          const active = activeId === section.id;
          return (
            <a
              key={section.id}
              href={`#${section.id}`}
              onClick={(event) => handleClick(event, section.id)}
              className={`relative shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                active
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-outline-variant bg-surface text-on-surface-variant hover:border-primary/40'
              }`}
            >
              {section.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
