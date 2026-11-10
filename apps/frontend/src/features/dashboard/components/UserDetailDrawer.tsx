import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../../components/ui/Icon';
import StatusPill from './StatusPill';
import type { UserDirectoryRecord } from '../../../api/users.api';
import type { Department } from '../../../api/departments.api';
import type { FacultyRequest } from '../../../api/faculty-requests.api';
import { humanizeRole, initials, relativeTime } from '../utils/dashboard.utils';

export default function UserDetailDrawer({
  open,
  onClose,
  user,
  departments,
  deptCode,
  onlineUserIds,
  requests,
}: {
  open: boolean;
  onClose: () => void;
  user: UserDirectoryRecord | null;
  departments: Department[];
  deptCode: (id: string) => string;
  onlineUserIds: Set<string>;
  requests: FacultyRequest[];
}) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const dept = useMemo(() => {
    if (!user?.dept_id) return null;
    return departments.find((d) => String(d.deptId) === String(user.dept_id)) ?? null;
  }, [departments, user]);

  const isOnline = user ? onlineUserIds.has(user.user_id) : false;

  const deptRequests = useMemo(() => {
    if (!user?.dept_id) return [];
    return requests
      .filter(
        (r) =>
          String(r.requestingDeptId) === String(user.dept_id) ||
          String(r.targetDeptId) === String(user.dept_id),
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() -
          new Date(a.createdAt ?? 0).getTime(),
      )
      .slice(0, 4);
  }, [requests, user]);

  return (
    <>
      {/* Backdrop — no transition, snaps in/out */}
      <div
        onClick={onClose}
        aria-hidden
        className={`fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-40 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer — no transition, snaps in/out */}
      <aside
        role="dialog"
        aria-modal={open}
        aria-label={user ? `Details for ${user.username}` : 'User details'}
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {user && (
          <>
            {/* Header */}
            <div className="relative bg-gradient-to-br from-primary to-[#3d0b10] px-5 pt-5 pb-6 text-white shrink-0">
              <button
                onClick={onClose}
                aria-label="Close"
                className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                <Icon name="close" size={18} />
              </button>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-14 h-14 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center font-bold text-lg border-2 border-white/20">
                    {initials(user.username)}
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-primary ${
                      isOnline ? 'bg-emerald-400' : 'bg-slate-400'
                    }`}
                    aria-hidden
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold truncate">{user.username}</h2>
                  <p className="text-xs text-white/70 mt-0.5">
                    {humanizeRole(user.role)}
                  </p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Status */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Presence
                  </p>
                  <p className="text-sm font-semibold text-slate-900 mt-1 flex items-center gap-1.5">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        isOnline ? 'bg-emerald-500' : 'bg-slate-400'
                      }`}
                    />
                    {isOnline ? 'Online' : 'Offline'}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Account
                  </p>
                  <p className="text-sm font-semibold text-slate-900 mt-1">
                    {user.is_active ? 'Active' : 'Inactive'}
                  </p>
                </div>
              </div>

              {/* Department */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Department
                </p>
                {dept ? (
                  <div className="bg-white border border-slate-200 rounded-lg p-3.5 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon name="apartment" size={18} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {dept.deptName}
                      </p>
                      <p className="text-xs text-slate-500 font-mono">
                        {dept.deptCode}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 italic">No department assigned</p>
                )}
              </div>

              {/* Recent cross-dept requests */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Recent requests
                </p>
                {deptRequests.length === 0 ? (
                  <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg p-4 text-center">
                    <Icon name="inbox" size={20} className="text-slate-300 mx-auto" />
                    <p className="text-xs text-slate-500 mt-1.5">
                      No recent requests involving this department.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {deptRequests.map((r) => (
                      <div
                        key={r.requestId}
                        className="bg-slate-50 border border-slate-200 rounded-lg p-2.5"
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[11px] font-bold text-primary">
                            {deptCode(r.requestingDeptId)}
                          </span>
                          <Icon name="arrow_forward" size={10} className="text-slate-400" />
                          <span className="font-mono text-[11px] font-bold text-slate-700">
                            {deptCode(r.targetDeptId)}
                          </span>
                          <StatusPill status={r.status} />
                          <span className="text-[10px] text-slate-400 ml-auto">
                            {relativeTime(r.createdAt)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-1 line-clamp-2 leading-snug">
                          {r.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 shrink-0 flex gap-2">
              <button
                onClick={() => {
                  onClose();
                  navigate('/approvals');
                }}
                className="flex-1 bg-primary hover:bg-[#3d0b10] text-white text-sm font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <Icon name="gavel" size={16} />
                View Approvals
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              >
                Close
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}