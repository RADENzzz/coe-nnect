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
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  return (
    <nav className={className} aria-label="Help sections">
      <div className="animate-slide-in-left hidden border border-slate-200 bg-white p-4 lg:block">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          On this page
        </div>
        <ul className="space-y-1">
          {sections.map((s, i) => (
            <li
              key={s.id}
              className="animate-slide-in-left"
              style={{
                animationDelay: `${i * 40}ms`,
                animationFillMode: 'both',
              }}
            >
              <a
                href={`#${s.id}`}
                onClick={(e) => handleClick(e, s.id)}
                className={
                  'block border-l-2 px-3 py-1.5 text-sm transition-all duration-200 ' +
                  (activeId === s.id
                    ? 'border-brand-700 bg-brand-50 font-medium text-brand-800'
                    : 'border-transparent text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:pl-4 hover:text-slate-900')
                }
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={(e) => handleClick(e, s.id)}
            className={
              'shrink-0 border px-3 py-1.5 text-xs transition-all duration-200 ' +
              (activeId === s.id
                ? 'border-brand-700 bg-brand-700 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')
            }
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  );
}