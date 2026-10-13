import { useState } from 'react';
import { FAQ as FAQ_ITEMS } from '../data/faq';

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-slate-900">
        Frequently Asked Questions
      </h2>
      <p className="mb-6 text-sm leading-relaxed text-slate-700">
        Quick answers to common questions about the system.
      </p>

      <div className="divide-y divide-slate-200 border border-slate-200 bg-white">
        {FAQ_ITEMS.map((item, i) => {
          const isOpen = open === i;
          return (
            <div
              key={i}
              className="animate-fade-up"
              style={{
                animationDelay: `${i * 30}ms`,
                animationFillMode: 'both',
              }}
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                className="group flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <span className="text-sm font-medium text-slate-900">
                  {item.q}
                </span>
                <span
                  className={
                    'material-symbols-outlined text-[20px] text-slate-400 transition-all duration-300 group-hover:text-brand-700 ' +
                    (isOpen ? 'rotate-180' : 'rotate-0')
                  }
                >
                  {isOpen ? 'expand_less' : 'expand_more'}
                </span>
              </button>
              <div
                className={
                  'grid overflow-hidden transition-all duration-300 ease-out ' +
                  (isOpen
                    ? 'grid-rows-[1fr] opacity-100'
                    : 'grid-rows-[0fr] opacity-0')
                }
              >
                <div className="overflow-hidden border-t border-slate-100 bg-slate-50">
                  <div className="px-4 py-3 text-sm leading-relaxed text-slate-700">
                    {item.a}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}