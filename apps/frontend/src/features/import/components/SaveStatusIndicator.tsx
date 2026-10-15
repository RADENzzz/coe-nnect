import Icon from '@/components/ui/Icon';
import type { SaveState } from '../hooks/useAutosave';

interface SaveStatusIndicatorProps {
  state: SaveState;
  error?: string | null;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export default function SaveStatusIndicator({
  state,
  error,
  onRetry,
  onDismiss,
}: SaveStatusIndicatorProps) {
  if (state === 'idle') return null;

  const base =
    'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors';

  if (state === 'saving') {
    return (
      <span className={`${base} bg-blue-100 text-blue-800`}>
        <Icon name="progress_activity" size={12} className="animate-spin" />
        Saving…
      </span>
    );
  }

  if (state === 'saved') {
    return (
      <span className={`${base} bg-green-100 text-green-800`}>
        <Icon name="check_circle" size={12} />
        Saved
      </span>
    );
  }

  return (
    <span
      className={`${base} bg-red-100 text-red-800 pr-1`}
      title={error ?? 'Save failed'}
      role="alert"
    >
      <Icon name="error" size={12} />
      <span className="mr-1">Save failed</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-red-200 hover:bg-red-300 rounded"
          title="Retry save"
        >
          Retry
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="ml-1 p-0.5 hover:bg-red-200 rounded"
          aria-label="Dismiss"
        >
          <Icon name="close" size={10} />
        </button>
      )}
    </span>
  );
}