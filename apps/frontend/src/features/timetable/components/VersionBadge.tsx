import Icon from '../../../components/ui/Icon';

interface VersionBadgeProps {
  versionNumber: number;
  finalizedByName?: string | null;
  capturedAt?: string | null;
  size?: 'sm' | 'md';
  onClick?: () => void;
}

/**
 * Small pill that shows which version a schedule belongs to.
 * Renders as a button when onClick is provided.
 */
export default function VersionBadge({
  versionNumber,
  finalizedByName,
  capturedAt,
  size = 'sm',
  onClick,
}: VersionBadgeProps) {
  const formattedDate = capturedAt
    ? new Date(capturedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const tooltip = [
    `Version ${versionNumber}`,
    finalizedByName ? `Finalized by ${finalizedByName}` : null,
    formattedDate ? `On ${formattedDate}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const base = [
    'inline-flex items-center gap-1',
    'font-semibold uppercase tracking-wider',
    'border border-primary/30 bg-primary/5 text-primary',
    'transition hover:bg-primary/10',
    size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1',
  ].join(' ');

  const content = (
    <>
      <Icon name="history" size={size === 'sm' ? 11 : 13} />
      <span>v{versionNumber}</span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={tooltip} className={base}>
        {content}
      </button>
    );
  }

  return (
    <span title={tooltip} className={base}>
      {content}
    </span>
  );
}