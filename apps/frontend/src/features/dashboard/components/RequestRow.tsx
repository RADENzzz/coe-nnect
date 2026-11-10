import Icon from '../../../components/ui/Icon';
import StatusPill from './StatusPill';
import type { FacultyRequest } from '../../../api/faculty-requests.api';
import { relativeTime } from '../utils/dashboard.utils';

export default function RequestRow({
  r,
  deptCode,
  onClick,
}: {
  r: FacultyRequest;
  deptCode: (id: string) => string;
  onClick?: () => void;
}) {
  return (
    <div className="py-3.5 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 px-2 rounded-lg transition-colors group">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-primary bg-primary/5 px-1.5 py-0.5 rounded">
              {deptCode(r.requestingDeptId)}
            </span>
            <Icon name="arrow_forward" size={12} className="text-slate-300" />
            <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
              {deptCode(r.targetDeptId)}
            </span>
            <StatusPill status={r.status} />
          </div>
          <p className="text-xs text-slate-600 mt-1.5 line-clamp-2 leading-relaxed">
            {r.reason}
          </p>
          <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
            <Icon name="tag" size={10} />
            Request #{r.requestId} · {relativeTime(r.createdAt)}
          </p>
        </div>
        {onClick && (
          <button
            onClick={onClick}
            className="text-primary text-xs font-semibold hover:underline shrink-0 bg-primary/5 px-2.5 py-1 rounded-md hover:bg-primary/10 transition-colors"
          >
            Review
          </button>
        )}
      </div>
    </div>
  );
}