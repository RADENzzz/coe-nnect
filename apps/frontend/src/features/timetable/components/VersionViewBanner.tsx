import Icon from '../../../components/ui/Icon';
import VersionBadge from './VersionBadge';

interface VersionViewBannerProps {
  versionNumber: number;
  finalizedByName: string | null;
  capturedAt: string | null;
  onExit: () => void;
}

function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Amber banner that appears above the timetable whenever the user is
 * viewing a historical version. Signals the read-only state and
 * provides a "Back to live" escape hatch.
 */
export default function VersionViewBanner({
  versionNumber,
  finalizedByName,
  capturedAt,
  onExit,
}: VersionViewBannerProps) {
  const when = formatDateTime(capturedAt);

  return (
    <div className="mb-4 p-3 rounded-xl border border-amber-300 bg-amber-50 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <Icon
          name="history"
          filled
          size={20}
          className="text-amber-700 shrink-0 mt-0.5"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-amber-900">
              Viewing historical version
            </p>
            <VersionBadge versionNumber={versionNumber} />
          </div>
          <p className="text-xs text-amber-800 mt-1 leading-relaxed">
            {finalizedByName && (
              <>
                Finalized by{' '}
                <span className="font-medium">{finalizedByName}</span>
              </>
            )}
            {finalizedByName && when && ' · '}
            {when}
            {' · '}
            <span className="font-medium">Read-only</span> — this snapshot
            won&apos;t change.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onExit}
        className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-[#5c1219] text-white rounded-lg hover:opacity-90 transition"
      >
        <Icon name="arrow_back" size={14} />
        Back to live
      </button>
    </div>
  );
}