import Icon from '@/components/ui/Icon';
import type { DeptLite } from './types';

export type RoleFilterValue =
  | 'all'
  | 'college_dean'
  | 'college_secretary'
  | 'department_head';

interface Props {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  roleFilter: RoleFilterValue;
  onRoleChange: (v: RoleFilterValue) => void;
  deptFilter: string;
  onDeptChange: (v: string) => void;
  departments: DeptLite[];
  shown: number;
  total: number;
  onClear: () => void;
}

export default function UserFilters({
  searchQuery,
  onSearchChange,
  roleFilter,
  onRoleChange,
  deptFilter,
  onDeptChange,
  departments,
  shown,
  total,
  onClear,
}: Props) {
  const isFiltered = !!searchQuery || roleFilter !== 'all' || deptFilter !== 'all';

  return (
    <div
      className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-surface-variant bg-surface-container-lowest"
      data-tour="users-filters"
    >
      <div className="flex-1 min-w-[220px]">
        <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
          Search
        </label>
        <div className="relative">
          <Icon
            name="search"
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Name, email, employee ID, or WMSU ID…"
            className="w-full bg-surface-container-low border border-surface-variant rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="min-w-[200px]">
        <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
          Department
        </label>
        <select
          value={deptFilter}
          onChange={(e) => onDeptChange(e.target.value)}
          className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
        >
          <option value="all">All departments</option>
          <option value="none">— no department —</option>
          {departments
            .filter((d) => d.isActive)
            .map((d) => (
              <option key={d.deptId} value={d.deptId}>
                [{d.deptCode}] {d.deptName}
              </option>
            ))}
        </select>
      </div>

      <div className="min-w-[160px]">
        <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
          Role
        </label>
        <select
          value={roleFilter}
          onChange={(e) => onRoleChange(e.target.value as RoleFilterValue)}
          className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
        >
          <option value="all">All roles</option>
          <option value="college_dean">College Dean</option>
          <option value="college_secretary">College Secretary</option>
          <option value="department_head">Department Head</option>
        </select>
      </div>

      {isFiltered && (
        <button
          onClick={onClear}
          className="text-xs px-3 py-2 rounded-lg border border-surface-variant text-on-surface-variant hover:bg-surface-container-low transition"
        >
          Clear
        </button>
      )}

      <div className="ml-auto text-xs text-on-surface-variant">
        Showing <strong className="text-on-surface">{shown}</strong> of {total}
      </div>
    </div>
  );
}