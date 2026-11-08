import Modal from '../../../../components/ui/Modal';
import BreakdownEmpty from '../BreakdownEmpty';
import StatusRow from '../StatusRow';

export default function CompletionModal({
  open,
  onClose,
  totalSchedules,
  finalizedOrPublished,
  completionRate,
  byStatus,
}: {
  open: boolean;
  onClose: () => void;
  totalSchedules: number;
  finalizedOrPublished: number;
  completionRate: number;
  byStatus: { draft: number; review: number; finalized: number; published: number };
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Completion Rate"
      description={`${finalizedOrPublished} of ${totalSchedules} entries finalized or published`}
      size="md"
    >
      {totalSchedules === 0 ? (
        <BreakdownEmpty message="No schedule entries to summarize." />
      ) : (
        <div className="space-y-4">
          <div className="text-center py-4">
            <div className="text-5xl font-extrabold text-[#5c1219] tabular-nums">
              {completionRate}%
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {finalizedOrPublished} of {totalSchedules} complete
            </p>
          </div>

          <div className="w-full bg-slate-100 h-2.5 overflow-hidden rounded-full">
            <div
              className="bg-gradient-to-r from-[#5c1219] to-[#8b1e2a] h-2.5 transition-all duration-500 rounded-full"
              style={{ width: `${completionRate}%` }}
            />
          </div>

          <div className="pt-2 space-y-2.5">
            <StatusRow label="Draft" count={byStatus.draft} total={totalSchedules} barColor="bg-slate-400" />
            <StatusRow label="In Review" count={byStatus.review} total={totalSchedules} barColor="bg-amber-500" />
            <StatusRow label="Finalized" count={byStatus.finalized} total={totalSchedules} barColor="bg-blue-500" />
            <StatusRow label="Published" count={byStatus.published} total={totalSchedules} barColor="bg-emerald-500" />
          </div>
        </div>
      )}
    </Modal>
  );
}