import Modal from '../../../../components/ui/Modal';
import BreakdownEmpty from '../BreakdownEmpty';
import FlaggedRow from '../FlaggedRow';
import type { RawSchedule } from '../../../../api/schedule.api';

export default function FlaggedModal({
  open,
  onClose,
  flagged,
  term,
  onOpenFlagged,
}: {
  open: boolean;
  onClose: () => void;
  flagged: RawSchedule[];
  term: any | undefined;
  onOpenFlagged: (s: RawSchedule) => void;
}) {
  const count = flagged.length;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Flagged for review"
      description={`${count} ${count === 1 ? 'entry' : 'entries'} flagged${
        term ? ` · ${term.termName}` : ''
      }`}
      size="lg"
    >
      {count === 0 ? (
        <BreakdownEmpty icon="verified" message="Nothing flagged. Looking good." />
      ) : (
        <div>
          {flagged.map((s) => (
            <FlaggedRow key={s.scheduleId} s={s} onOpen={() => onOpenFlagged(s)} />
          ))}
        </div>
      )}
    </Modal>
  );
}