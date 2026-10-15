import { useState } from 'react';
import { motion } from 'motion/react';
import { ABOUT } from '../data/team';
import { Stagger, StaggerItem } from '../components/animations';

export function VersionInfo() {
  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-slate-900">Version Info</h2>
      <p className="mb-6 text-sm leading-relaxed text-slate-700">
        Current build details for CoE-NNECT.
      </p>

      <Stagger className="border border-slate-200 bg-white" step={0.05}>
        <StaggerItem>
          <Row label="Product" value={ABOUT.product} />
        </StaggerItem>
        <StaggerItem>
          <Row label="Full name" value={ABOUT.fullName} />
        </StaggerItem>
        <StaggerItem>
          <Row label="Institution" value={ABOUT.institution} />
        </StaggerItem>
        <StaggerItem>
          <Row label="Version" value={ABOUT.version} copyable />
        </StaggerItem>
        <StaggerItem>
          <Row label="Build date" value={ABOUT.buildDate} copyable />
        </StaggerItem>
        <StaggerItem>
          <Row label="Description" value={ABOUT.description} last />
        </StaggerItem>
      </Stagger>
    </div>
  );
}

function Row({
  label,
  value,
  last,
  copyable,
}: {
  label: string;
  value: string;
  last?: boolean;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* noop */
    }
  };

  return (
    <motion.div
      whileHover={{ backgroundColor: 'rgba(248, 250, 252, 1)' }}
      className={
        'grid grid-cols-1 gap-1 px-4 py-3 md:grid-cols-[160px_1fr] md:gap-4 ' +
        (last ? '' : 'border-b border-slate-100')
      }
    >
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="flex items-center justify-between gap-3 text-sm text-slate-800">
        <span>{value}</span>
        {copyable && (
          <button
            type="button"
            onClick={onCopy}
            aria-label={`Copy ${label}`}
            className="flex h-7 w-7 items-center justify-center border border-slate-200 text-slate-500 transition-colors hover:border-brand-300 hover:text-brand-700"
          >
            <span className="material-symbols-outlined text-[14px]">
              {copied ? 'check' : 'content_copy'}
            </span>
          </button>
        )}
      </div>
    </motion.div>
  );
}