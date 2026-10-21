import type { Dispatch, RefObject, SetStateAction } from 'react';
import Icon from '../../../components/ui/Icon';
import type { Department } from '../../../api/departments.api';
import type { SubjectRoomType } from '../../../api/subjects.api';

export type PresetKey =
  | 'mixed'
  | 'minors'
  | 'no_room'
  | 'lecture_only'
  | 'lab_only';

export interface Preset {
  key: PresetKey;
  label: string;
  icon: string;
  apply: (setFilter: (key: string, value: string) => void) => void;
}

interface FilterPill {
  label: string;
  onRemove: () => void;
}

interface RoomTypeOption {
  value: '' | SubjectRoomType;
  label: string;
  icon: string;
}

export interface SubjectFiltersPanelProps {
  activeFilterCount: number;
  filtersExpanded: boolean;
  setFiltersExpanded: Dispatch<SetStateAction<boolean>>;
  filteredCount: number;
  totalCount: number;
  hasAnyFilter: boolean;
  clearAll: () => void;
  PRESETS: Preset[];
  isPresetActive: (key: PresetKey) => boolean;
  applyPreset: (preset: Preset) => void;
  filterPills: FilterPill[];
  searchInput: string;
  setSearchInput: (value: string) => void;
  searchRef: RefObject<HTMLInputElement>;
  deptFilter: string;
  roomFilter: string;
  minorFilter: string;
  compFilter: string;
  statusFilter: string;
  setFilter: (key: string, value: string) => void;
  departments: Department[];
  deptCounts: Map<string, number>;
  ROOM_TYPES: RoomTypeOption[];
}

export default function SubjectFiltersPanel({
  activeFilterCount,
  filtersExpanded,
  setFiltersExpanded,
  filteredCount,
  totalCount,
  hasAnyFilter,
  clearAll,
  PRESETS,
  isPresetActive,
  applyPreset,
  filterPills,
  searchInput,
  setSearchInput,
  searchRef,
  deptFilter,
  roomFilter,
  minorFilter,
  compFilter,
  statusFilter,
  setFilter,
  departments,
  deptCounts,
  ROOM_TYPES,
}: SubjectFiltersPanelProps) {
  return (
      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setFiltersExpanded((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-on-surface hover:text-primary transition"
          >
            <Icon
              name={filtersExpanded ? 'expand_less' : 'expand_more'}
              size={18}
            />
            Filters
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-on-primary text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant hidden sm:inline">
              Showing{' '}
              <strong className="text-on-surface">{filteredCount}</strong> of{' '}
              {totalCount}
            </span>
            {hasAnyFilter && (
              <button
                type="button"
                onClick={clearAll}
                className="text-xs px-3 py-1.5 rounded-lg border border-surface-variant text-on-surface-variant hover:bg-surface-container-low transition"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Preset chips */}
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider self-center mr-1">
            Quick views
          </span>
          {PRESETS.map((preset) => {
            const active = isPresetActive(preset.key);
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                  active
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-primary hover:text-primary'
                }`}
              >
                <Icon name={preset.icon} size={11} />
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Filter pills */}
        {filterPills.length > 0 && (
          <div className="px-4 pb-3 flex flex-wrap gap-1.5 border-t border-surface-variant pt-3">
            {filterPills.map((pill, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border bg-primary/5 text-primary border-primary/30"
              >
                {pill.label}
                <button
                  type="button"
                  onClick={pill.onRemove}
                  className="hover:bg-black/5 rounded-full p-0.5"
                  aria-label={`Remove filter: ${pill.label}`}
                >
                  <Icon name="close" size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Expanded controls */}
        {filtersExpanded && (
          <div className="border-t border-surface-variant p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  Search
                  <kbd className="ml-2 px-1.5 py-0.5 text-[9px] font-mono bg-surface-container-low border border-surface-variant rounded">
                    /
                  </kbd>
                </label>
                <div className="relative">
                  <Icon
                    name="search"
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
                  />
                  <input
                    ref={searchRef}
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Code, title, or dept code…"
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg pl-9 pr-9 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  />
                  {searchInput && (
                    <button
                      type="button"
                      onClick={() => setSearchInput('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-1"
                      aria-label="Clear search"
                    >
                      <Icon name="close" size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  Department
                </label>
                <select
                  value={deptFilter}
                  onChange={(e) => setFilter('dept', e.target.value)}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                >
                  <option value="">All departments</option>
                  {departments
                    .filter((d) => d.isActive)
                    .map((d) => {
                      const count = deptCounts.get(String(d.deptId)) ?? 0;
                      return (
                        <option key={d.deptId} value={d.deptId}>
                          [{d.deptCode}] {d.deptName} ({count})
                        </option>
                      );
                    })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  Room Type
                </label>
                <select
                  value={roomFilter}
                  onChange={(e) => setFilter('room', e.target.value)}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                >
                  <option value="">Any room type</option>
                  <option value="none">No specific room</option>
                  {ROOM_TYPES.filter((r) => r.value).map((rt) => (
                    <option key={rt.value} value={rt.value}>
                      {rt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  Classification
                </label>
                <select
                  value={minorFilter}
                  onChange={(e) => setFilter('minor', e.target.value)}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                >
                  <option value="all">All subjects</option>
                  <option value="minor">Minor only</option>
                  <option value="regular">Regular only</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  Component
                </label>
                <select
                  value={compFilter}
                  onChange={(e) => setFilter('comp', e.target.value)}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                >
                  <option value="all">Any</option>
                  <option value="lecture_only">Lecture only</option>
                  <option value="lab_only">Lab only</option>
                  <option value="mixed">Mixed (Lec + Lab)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setFilter('status', e.target.value)}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
  );
}
