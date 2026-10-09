import Modal from '../../../components/ui/Modal';
import Icon from '../../../components/ui/Icon';
import type { PendingMoveConfirmation } from '../hooks/useMoveSchedule';

interface Props {
  pending: PendingMoveConfirmation | null;
}

export default function MoveScheduleConfirmModal({ pending }: Props) {
  if (!pending) return null;

  const count = pending.warnings.length;

  return (
    <Modal
      open={true}
      onClose={() => pending.resolve(false)}
      title="Move has warnings"
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={() => pending.resolve(false)}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => pending.resolve(true)}
            className="px-4 py-2 text-sm font-semibold bg-[#5c1219] text-white hover:opacity-90 transition"
          >
            Move anyway
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <Icon
            name="warning"
            size={18}
            className="text-amber-700 mt-0.5 shrink-0"
          />
          <div className="text-xs text-amber-800">
            <p className="font-semibold mb-1">
              {count} soft warning{count === 1 ? '' : 's'}
            </p>
            <p>
              The move doesn't violate any hard rule, but the constraint
              engine flagged the following:
            </p>
          </div>
        </div>

        <ul className="space-y-2 max-h-60 overflow-y-auto">
          {pending.warnings.map((w, i) => (
            <li
              key={`${w.ruleId}-${i}`}
              className="flex items-start gap-2 text-xs text-slate-700"
            >
              <span className="font-mono font-bold text-[#5c1219] shrink-0">
                {w.ruleId}
              </span>
              <span className="text-slate-600">{w.reason}</span>
            </li>
          ))}
        </ul>

        <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
          Moving from{' '}
          <span className="font-mono font-semibold text-slate-700">
            {pending.fromDay} {pending.fromTime}
          </span>{' '}
          to{' '}
          <span className="font-mono font-semibold text-slate-700">
            {pending.toDay} {pending.toTime}
          </span>
        </p>
      </div>
    </Modal>
  );
}