import { useQuery } from '@tanstack/react-query';
import { fetchDepartments } from '../../api/departments.api';
import { fetchUsers } from '../../api/users.api';
import Icon from '../../components/ui/Icon';

export default function DeanDepartmentsPage() {
  const { data: departments = [], isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  });

  const getDeptHead = (deptId: string) =>
    users.find(
      (u) => u.role === 'department_head' && String(u.deptId) === String(deptId) && u.isActive,
    );

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Departments</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          All departments under the College of Engineering.
        </p>
      </div>

      <div className="bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
            {departments.length} Department(s)
          </span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-2 border-[#5c1219] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : departments.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">No departments found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
                <th className="text-left px-5 py-3">Department</th>
                <th className="text-left px-5 py-3">Code</th>
                <th className="text-left px-5 py-3">Department Head</th>
                <th className="text-left px-5 py-3">Description</th>
                <th className="text-left px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((dept) => {
                const head = getDeptHead(dept.deptId);
                return (
                  <tr key={dept.deptId} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{dept.deptName}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-wide">
                        {dept.deptCode}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {head ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-[#5c1219] text-white flex items-center justify-center text-[10px] font-bold uppercase">
                            {head.username[0]}
                          </div>
                          <span className="text-slate-700 font-medium">{head.username}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Not assigned</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-500 text-xs max-w-[200px] truncate">
                      {dept.description || '—'}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 border ${
                          dept.isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                        }`}
                      >
                        {dept.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
