import Icon from '../../../components/ui/Icon';
import type { GridDensity } from './GridMetricsContext';
import type { LayoutMode, SubMode, ViewMode } from '../types';
import {
  departmentTabTone,
  visibleTimetableViewTabs,
} from '../timetable-scope';

interface SelectOption {
  value: string;
  label: string;
  deptCode?: string;
}

export interface TimetableFilterBarProps {
  activeTerm: unknown | null;
  activeVersion: unknown | null;
  viewMode: ViewMode;
  setViewMode: (value: ViewMode) => void;
  viewDeptId: string;
  setViewDeptId: (value: string) => void;
  subMode: SubMode;
  setSubMode: (value: SubMode) => void;
  subTargetId: string;
  setSubTargetId: (value: string) => void;
  roomTargetId: string;
  setRoomTargetId: (value: string) => void;
  facultyTargetId: string;
  setFacultyTargetId: (value: string) => void;
  onlyConflicts: boolean;
  setOnlyConflicts: (value: boolean) => void;
  layoutMode: LayoutMode;
  setLayoutMode: (value: LayoutMode) => void;
  setLayoutTouched: (value: boolean) => void;
  gridDensity: GridDensity;
  setGridDensity: (value: GridDensity) => void;
  deptOptions: SelectOption[];
  roomOptions: SelectOption[];
  facultyOptions: SelectOption[];
  sectionOptions: SelectOption[];
  hasAnyFilter: boolean;
  clearFilters: () => void;
  myDeptId: string;
  isDepartmentHead: boolean;
  conflictCount: number;
}

export default function TimetableFilterBar({
  activeTerm,
  activeVersion,
  viewMode,
  setViewMode,
  viewDeptId,
  setViewDeptId,
  subMode,
  setSubMode,
  subTargetId,
  setSubTargetId,
  roomTargetId,
  setRoomTargetId,
  facultyTargetId,
  setFacultyTargetId,
  onlyConflicts,
  setOnlyConflicts,
  layoutMode,
  setLayoutMode,
  setLayoutTouched,
  gridDensity,
  setGridDensity,
  deptOptions,
  roomOptions,
  facultyOptions,
  sectionOptions,
  hasAnyFilter,
  clearFilters,
  myDeptId,
  isDepartmentHead,
  conflictCount,
}: TimetableFilterBarProps) {
  if (!activeTerm) return null;
  const visibleTabs = visibleTimetableViewTabs(
    isDepartmentHead ? 'department_head' : undefined,
  );

  return (
        <div className="mb-4 flex flex-col gap-3 p-3 md:p-4 rounded-xl border border-surface-variant bg-surface-container-lowest">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[150px]">
                <span className="mb-1.5 block text-xs font-semibold uppercase text-on-surface-variant">
                  Schedule View
                </span>
                <div
                  role="tablist"
                  aria-label="Schedule view"
                  className="flex w-full flex-wrap gap-1 rounded-lg border border-surface-variant bg-surface-container-low p-1"
                >
                  {visibleTabs.map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      role="tab"
                      aria-selected={viewMode === tab.value}
                      onClick={() => {
                        setViewMode(tab.value);
                  setSubMode('all');
                  setSubTargetId('');
                  setRoomTargetId('');
                  setFacultyTargetId('');
                    setViewDeptId('');
                      }}
                      className={`min-h-9 flex-1 rounded-md px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        viewMode === tab.value
                          ? 'bg-surface text-primary shadow-sm'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
            </div>

            {viewMode === 'byDepartment' && (
              <div className="flex-1 min-w-[180px]">
                <span className="mb-1.5 block text-xs font-semibold uppercase text-on-surface-variant">
                  Department
                </span>
                <div className="relative">
                  {(() => {
                    const selected = deptOptions.find(
                      (opt) => opt.value === viewDeptId,
                    );
                    const tone = selected?.deptCode
                      ? departmentTabTone(selected.deptCode)
                      : null;
                    return tone ? (
                      <span
                        aria-hidden="true"
                        className={`absolute left-3 top-1/2 z-10 size-2 -translate-y-1/2 rounded-full ${tone.dot}`}
                      />
                    ) : null;
                  })()}
                  <select
                    value={viewDeptId}
                    aria-label="Department"
                    onChange={(e) => {
                      setViewDeptId(e.target.value);
                      setSubMode('all');
                      setSubTargetId('');
                    }}
                    className="w-full rounded-lg border border-surface-variant bg-surface-container-low py-2 pl-7 pr-3 text-sm focus:border-primary focus:outline-none"
                  >
                    <option value="">— select department —</option>
                    {deptOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {viewMode === 'byRoom' && (
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  Room
                </label>
                <select
                  value={roomTargetId}
                  onChange={(e) => setRoomTargetId(e.target.value)}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                >
                  <option value="">— select —</option>
                  {roomOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {viewMode === 'byFaculty' && (
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  Faculty
                </label>
                <select
                  value={facultyTargetId}
                  onChange={(e) => setFacultyTargetId(e.target.value)}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                >
                  <option value="">— select —</option>
                  {facultyOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {hasAnyFilter && (
              <button
                onClick={clearFilters}
                className="text-xs px-3 py-2 rounded-lg border border-surface-variant text-on-surface-variant hover:bg-surface-container-low transition"
              >
                Clear filter
              </button>
            )}
          </div>

          {viewMode === 'byDepartment' && viewDeptId && (
            <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-surface-variant">
              <div className="flex-1 min-w-[150px]">
                <span className="mb-1.5 block text-xs font-semibold uppercase text-on-surface-variant">
                  Department Scope
                </span>
                <div
                  role="tablist"
                  aria-label="Department scope"
                  className="inline-flex rounded-lg border border-surface-variant bg-surface-container-low p-0.5"
                >
                  {[
                    { value: 'all' as SubMode, label: 'Whole department' },
                    { value: 'bySection' as SubMode, label: 'Section' },
                    { value: 'byFaculty' as SubMode, label: 'Faculty' },
                  ].map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      role="tab"
                      aria-selected={subMode === tab.value}
                      onClick={() => {
                        setSubMode(tab.value);
                        setSubTargetId('');
                      }}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                        subMode === tab.value
                          ? 'bg-surface text-primary shadow-sm'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {subMode === 'bySection' && (
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                    Section
                  </label>
                  <select
                    value={subTargetId}
                    onChange={(e) => setSubTargetId(e.target.value)}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="">— select —</option>
                    {sectionOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {subMode === 'byFaculty' && (
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                    Faculty
                  </label>
                  <select
                    value={subTargetId}
                    onChange={(e) => setSubTargetId(e.target.value)}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="">— select —</option>
                    {facultyOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-surface-variant">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                Layout
              </span>
              <div
                role="tablist"
                aria-label="Layout"
                className="inline-flex rounded-lg border border-surface-variant bg-surface-container-low p-0.5"
              >
                <button
                  role="tab"
                  aria-selected={layoutMode === 'agenda'}
                  onClick={() => {
                    setLayoutMode('agenda');
                    setLayoutTouched(true);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                    layoutMode === 'agenda'
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                  title="Agenda view (A)"
                >
                  <Icon name="view_list" size={14} />
                  Agenda
                </button>
                <button
                  role="tab"
                  aria-selected={layoutMode === 'grid'}
                  onClick={() => {
                    setLayoutMode('grid');
                    setLayoutTouched(true);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                    layoutMode === 'grid'
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                  title="Grid view (G)"
                >
                  <Icon name="grid_on" size={14} />
                  Grid
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {layoutMode === 'grid' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                    Density
                  </span>
                  <div className="inline-flex rounded-lg border border-surface-variant bg-surface-container-low p-0.5">
                    <button
                      onClick={() => setGridDensity('compact')}
                      aria-pressed={gridDensity === 'compact'}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                        gridDensity === 'compact'
                          ? 'bg-white text-primary shadow-sm'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      Compact
                    </button>
                    <button
                      onClick={() => setGridDensity('comfortable')}
                      aria-pressed={gridDensity === 'comfortable'}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                        gridDensity === 'comfortable'
                          ? 'bg-white text-primary shadow-sm'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      Comfortable
                    </button>
                  </div>
                </div>
              )}

              {!activeVersion && (
                <label className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={onlyConflicts}
                    onChange={(e) => setOnlyConflicts(e.target.checked)}
                    className="accent-primary"
                  />
                  <Icon name="warning" size={14} />
                  Only conflicts
                  {conflictCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-bold">
                      {conflictCount}
                    </span>
                  )}
                </label>
              )}
            </div>
          </div>
        </div>
  );
}
