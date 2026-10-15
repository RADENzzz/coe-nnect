import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { FAQ as FAQ_ITEMS } from '../data/faq';
import { AccordionItem } from '../components/animations';

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  const [allOpen, setAllOpen] = useState(false);

  const openSet = useMemo(() => {
    if (allOpen) return new Set(FAQ_ITEMS.map((_, i) => i));
    return new Set(open == null ? [] : [open]);
  }, [allOpen, open]);

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-900">
          Frequently Asked Questions
        </h2>
        <button
          type="button"
          onClick={() => {
            setAllOpen((v) => !v);
            setOpen(null);
          }}
          className="text-xs font-medium text-brand-700 hover:underline"
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <p className="mb-6 text-sm leading-relaxed text-slate-700">
        Quick answers to common questions about the system.
      </p>

      <div className="divide-y divide-slate-200 border border-slate-200 bg-white">
        {FAQ_ITEMS.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.35, delay: i * 0.03 }}
          >
            <AccordionItem
              open={openSet.has(i)}
              onToggle={() => {
                setAllOpen(false);
                setOpen(openSet.has(i) ? null : i);
              }}
              header={
                <span className="text-sm font-medium text-slate-900">
                  {item.q}
                </span>
              }
            >
              <div className="text-sm leading-relaxed text-slate-700">
                {item.a}
              </div>
            </AccordionItem>
          </motion.div>
        ))}
      </div>
    </div>
  );
}