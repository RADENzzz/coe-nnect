import Icon from '@/components/ui/Icon';
import type { SaveState } from '../hooks/useAutosave';

interface SaveStatusIndicatorProps {
  state: SaveState;
  error?: string | null;
}

export default function SaveStatusIndicator({
  state,
  error,
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
      className={`${base} bg-red-100 text-red-800`}
      title={error ?? 'Save failed'}
    >
      <Icon name="error" size={12} />
      Save failed
    </span>
  );
}