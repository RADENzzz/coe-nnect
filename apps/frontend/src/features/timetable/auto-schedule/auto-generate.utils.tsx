import Icon from '../../../components/ui/Icon';

export function extractApiError(err: any): {
  title: string;
  message: string;
  details: string[];
} {
  const status = err?.response?.status;
  const body = err?.response?.data;
  const rawMessage = body?.message;

  const messages: string[] = Array.isArray(rawMessage)
    ? rawMessage
    : rawMessage
    ? [rawMessage]
    : [];

  const title =
    status === 400
      ? 'Cannot generate schedule'
      : status === 401
      ? 'Session expired'
      : status === 403
      ? 'Permission denied'
      : status === 404
      ? 'Not found'
      : status === 409
      ? 'Another generation in progress'
      : status === 500
      ? 'Server error'
      : 'Auto-generate failed';

  const message =
    messages[0] ??
    err?.message ??
    'Something went wrong. Please try again.';

  return { title, message, details: messages.slice(1) };
}

/**
 * Turn a known server message into one or more actionable hints.
 * These are shown above the technical details so the user knows the
 * next step without needing to understand the error.
 */
export function hintsForMessage(message: string): string[] {
  const m = message.toLowerCase();
  const hints: string[] = [];

  if (/no active sections/.test(m)) {
    hints.push(
      'Create at least one section for this department under Sections before generating a schedule.',
    );
  }
  if (/no semester|semester.*not set|has no semester/.test(m)) {
    hints.push(
      'Set the semester on the active term in System Settings → Terms.',
    );
  }
  if (/no (?:active )?faculty|no faculty/.test(m)) {
    hints.push(
      'Add at least one active faculty member to this department before generating.',
    );
  }
  if (/no (?:active )?subjects|no subjects/.test(m)) {
    hints.push(
      'Add subjects and prospectus entries for this department before generating.',
    );
  }
  if (/not enough rooms|room deficit/.test(m)) {
    hints.push(
      'Add more rooms or reduce the number of sections needing the same room type.',
    );
  }
  if (/unplotted minors|minor subjects/.test(m)) {
    hints.push(
      'Plot the outstanding minor subjects first, or choose "Skip and generate anyway" to proceed.',
    );
  }
  if (/already running|in progress/.test(m)) {
    hints.push(
      'Wait for the current generation to finish, then try again.',
    );
  }
  if (/forbidden|permission/.test(m)) {
    hints.push(
      'Only Department Heads can run auto-generate for their department.',
    );
  }
  if (/session expired|unauthorized/.test(m)) {
    hints.push('Log out and log back in to refresh your session.');
  }

  return hints;
}

// ═══════════════════════════════════════════════════════════════════
// Auto-generate progress
// ═══════════════════════════════════════════════════════════════════

export function getGenerationProgressMessage(elapsedMs: number): {
  label: string;
  progress: number;
} {
  const sec = elapsedMs / 1000;
  const raw = 1 - Math.exp(-sec / 6);
  const progress = Math.min(95, Math.round(raw * 100));
  let label: string;
  if (sec < 2) label = 'Starting solver…';
  else if (sec < 5) label = 'Analyzing constraints…';
  else if (sec < 10) label = 'Solving schedule…';
  else if (sec < 20) label = 'Placing classes…';
  else if (sec < 40) label = 'Almost done…';
  else label = 'Taking longer than expected…';
  return { label, progress };
}

interface AutoGenerateButtonProps {
  isGenerating: boolean;
  isServerSide: boolean;
  elapsedMs: number;
  onClick: () => void;
  /** When true, the button is greyed out and unclickable. */
  disabled?: boolean;
  /** Tooltip / title shown while disabled. */
  disabledReason?: string;
}

export default function AutoGenerateButton({
  isGenerating,
  isServerSide,
  elapsedMs,
  onClick,
  disabled = false,
  disabledReason,
}: AutoGenerateButtonProps) {
  const { label, progress } = isServerSide
    ? { label: 'Other user generating…', progress: 60 }
    : getGenerationProgressMessage(elapsedMs);

  const isBlocked = disabled && !isGenerating;

  return (
    <button
      onClick={onClick}
      disabled={isGenerating || disabled}
      title={isBlocked ? disabledReason : undefined}
      aria-busy={isGenerating}
      aria-live="polite"
      aria-disabled={isGenerating || disabled}
      className={[
        'relative inline-flex items-center justify-center gap-2',
        'px-3 w-[240px] h-[38px]',
        'text-sm font-semibold rounded-lg transition',
        'overflow-hidden',
        isGenerating
          ? 'bg-primary/5 border border-primary text-primary cursor-not-allowed'
          : isBlocked
          ? 'bg-surface-container-high border border-surface-variant text-on-surface-variant cursor-not-allowed opacity-70'
          : 'border border-primary text-primary hover:bg-primary/5',
      ].join(' ')}
    >
      {isGenerating && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-primary/15 transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      )}
      {!isGenerating && (
        <>
          <Icon
            name={isBlocked ? 'block' : 'auto_awesome'}
            size={16}
            className="relative z-10 shrink-0"
          />
          <span className="relative z-10">Auto-Generate</span>
        </>
      )}
      {isGenerating && (
        <>
          <span
            className="w-3.5 h-3.5 border-2 border-primary/40 border-t-primary rounded-full animate-spin relative z-10 shrink-0"
            aria-hidden
          />
          <span className="relative z-10 tabular-nums truncate min-w-0">
            {label}
          </span>
          <span className="relative z-10 tabular-nums text-xs opacity-70 shrink-0">
            {progress}%
          </span>
        </>
      )}
    </button>
  );
}
