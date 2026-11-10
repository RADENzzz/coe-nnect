import { Link } from 'react-router-dom';
import Icon from '../../../../components/ui/Icon';
import Modal from '../../../../components/ui/Modal';
import BreakdownEmpty from '../BreakdownEmpty';
import RequestRow from '../RequestRow';
import type { FacultyRequest } from '../../../../api/faculty-requests.api';

export default function TasksModal({
  open,
  onClose,
  pendingIncoming,
  deptCode,
  onReview,
}: {
  open: boolean;
  onClose: () => void;
  pendingIncoming: FacultyRequest[];
  deptCode: (id: string) => string;
  onReview: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pending Tasks"
      description={`${pendingIncoming.length} cross-department request${
        pendingIncoming.length === 1 ? '' : 's'
      } awaiting your decision`}
      size="lg"
    >
      {pendingIncoming.length === 0 ? (
        <BreakdownEmpty
          icon="check_circle"
          message="Nothing pending. You're all caught up."
        />
      ) : (
        <div>
          {pendingIncoming.map((r) => (
            <RequestRow key={r.requestId} r={r} deptCode={deptCode} onClick={onReview} />
          ))}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <Link
              to="/approvals"
              onClick={onClose}
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
            >
              Go to Approvals
              <Icon name="arrow_forward" size={14} />
            </Link>
          </div>
        </div>
      )}
    </Modal>
  );
}