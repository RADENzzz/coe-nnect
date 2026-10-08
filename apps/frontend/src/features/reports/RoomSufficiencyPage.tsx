import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchRoomSufficiency,
  type RoomSufficiencyReport,
} from '../../api/schedule.api';
import { fetchDepartments } from '../../api/departments.api';
import Icon from '../../components/ui/Icon';

function formatHours(h: number): string {
  return `${h.toFixed(1)}h`;
}

export default function RoomSufficiencyPage() {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  const isDH = profile?.role === 'department_head';
  const myDeptId = profile?.dept_id ? String(profile.dept_id) : '';
  const isAdminOrDean =
    profile?.role === 'administrator' || profile?.role === 'college_dean';

  const [deptFilter, setDeptFilter] = useState<string>(
    isDH && myDeptId ? myDeptId : '',
  );

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: reports = [], isLoading, error } = useQuery({
    queryKey: ['room-sufficiency', deptFilter],
    queryFn: () =>
      fetchRoomSufficiency(deptFilter ? { deptId: deptFilter } : undefined),
    enabled: !!user,
    staleTime: 30 * 1000, // refresh every 30s
  });

  // ── Aggregates for the summary tiles ──
  const summary = useMemo(() => {
    let sufficient = 0;
    let deficient = 0;
    let totalMissingRooms = 0;
    for (const r of reports) {
      if (r.sufficient) sufficient++;
      else {
        deficient++;
        for (const d of r.deficits) {
          totalMissingRooms += d.suggestedExtraRooms;
        }
      }
    }
    return { sufficient, deficient, totalMissingRooms };
  }, [reports]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">
            Room Sufficiency
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Projected demand vs. available room-hours per room type. Run this
            before generating a schedule to check whether your room inventory
            can hold the curriculum.
          </p>
        </div>

        {isAdminOrDean && (
          <div className="min-w-[220px]">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
              Department
            </label>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              <option value="">All departments</option>
              {departments
                .filter((d) => d.isActive)
                .map((d) => (
                  <option key={d.deptId} value={d.deptId}>
                    [{d.deptCode}] {d.deptName}
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>

      {/* Summary tiles */}
      {!isLoading && reports.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
            <div className="w-9 h-9 bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0">
              <Icon name="check_circle" filled size={18} className="text-emerald-700" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-emerald-900">
                {summary.sufficient}
              </p>
              <p className="text-xs font-semibold text-emerald-800">
                Sufficient
              </p>
              <p className="text-[10px] text-emerald-700/80 mt-0.5">
                Department(s) with enough rooms
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
            <div className="w-9 h-9 bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
              <Icon name="warning" filled size={18} className="text-amber-700" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-amber-900">
                {summary.deficient}
              </p>
              <p className="text-xs font-semibold text-amber-800">
                Deficient
              </p>
              <p className="text-[10px] text-amber-700/80 mt-0.5">
                Department(s) needing more rooms
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
            <div className="w-9 h-9 bg-red-100 border border-red-200 flex items-center justify-center shrink-0">
              <Icon name="add_home" filled size={18} className="text-red-700" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-red-900">
                {summary.totalMissingRooms}
              </p>
              <p className="text-xs font-semibold text-red-800">
                Rooms to add
              </p>
              <p className="text-[10px] text-red-700/80 mt-0.5">
                Across all deficient departments
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Loading / Error */}
      {isLoading && (
        <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-10 flex items-center justify-center gap-2 text-sm text-on-surface-variant">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Analyzing room inventory…
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm">
          Failed to load room sufficiency:{' '}
          {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {/* Report cards */}
      {!isLoading &&
        reports.map((r) => (
          <section
            key={r.deptId}
            className="rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden"
          >
            {/* Card header */}
            <header className="px-5 py-4 border-b border-surface-variant bg-surface-container-low flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider flex items-center gap-2">
                  <Icon
                    name={r.sufficient ? 'check_circle' : 'warning'}
                    filled
                    size={18}
                    className={
                      r.sufficient ? 'text-emerald-600' : 'text-amber-600'
                    }
                  />
                  [{r.deptCode}] {r.deptName}
                </h2>
                {r.termLabel && (
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {r.termLabel}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold uppercase tracking-wider px-2 py-1 border ${
                    r.sufficient
                      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                      : 'text-amber-700 bg-amber-50 border-amber-200'
                  }`}
                >
                  {r.sufficient ? 'Sufficient' : 'Deficient'}
                </span>
              </div>
            </header>

            {/* Totals row */}
            <div className="px-5 py-3 border-b border-surface-variant bg-surface-container-lowest grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">
                  Subjects
                </p>
                <p className="text-lg font-bold text-on-surface">
                  {r.totals.subjects}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">
                  Sections
                </p>
                <p className="text-lg font-bold text-on-surface">
                  {r.totals.sections}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">
                  Blocks
                </p>
                <p className="text-lg font-bold text-on-surface">
                  {r.totals.blocks}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">
                  Rooms Available
                </p>
                <p className="text-lg font-bold text-on-surface">
                  {r.totals.rooms}
                </p>
              </div>
            </div>

            {/* Deficits */}
            {r.deficits.length > 0 ? (
              <div className="p-5 space-y-3">
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                  Shortfalls
                </p>
                <div className="rounded-lg border border-red-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-red-50 border-b border-red-200 text-red-900 text-xs uppercase tracking-wider">
                        <th className="text-left px-4 py-2.5">Room Type</th>
                        <th className="text-right px-4 py-2.5">Needed</th>
                        <th className="text-right px-4 py-2.5">Available</th>
                        <th className="text-right px-4 py-2.5">Short by</th>
                        <th className="text-right px-4 py-2.5">Add</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.deficits.map((d) => (
                        <tr
                          key={d.roomType}
                          className="border-b border-red-100 last:border-b-0"
                        >
                          <td className="px-4 py-3 font-medium text-on-surface capitalize">
                            {d.roomType.replace(/_/g, ' ')}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-on-surface-variant">
                            {formatHours(d.neededHours)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-on-surface-variant">
                            {formatHours(d.availableHours)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-red-700 font-semibold">
                            {formatHours(d.shortByHours)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-white bg-red-600 px-2 py-1">
                              <Icon name="add" size={12} />
                              {d.suggestedExtraRooms}{' '}
                              {d.suggestedExtraRooms === 1 ? 'room' : 'rooms'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <strong>Tip:</strong> {r.hint}
                </p>
              </div>
            ) : (
              <div className="p-5">
                <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
                  <Icon name="check_circle" filled size={16} />
                  This department has enough rooms for its 1st-semester
                  prospectus.
                </p>
              </div>
            )}
          </section>
        ))}

      {!isLoading && reports.length === 0 && !error && (
        <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-10 text-center">
          <Icon
            name="inbox"
            size={40}
            className="text-on-surface-variant/40 mx-auto mb-3"
          />
          <p className="text-sm text-on-surface-variant">
            No departments to analyze.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3 text-sm">
        <Icon
          name="info"
          size={18}
          className="text-blue-700 shrink-0 mt-0.5"
        />
        <div className="text-blue-900 text-xs space-y-1">
          <p>
            <strong>How to read this:</strong> the analysis projects weekly
            room-hours from your current 1st-semester prospectus, then compares
            against the total weekly hours your rooms of each type can provide.
          </p>
          <p>
            If a room type is short, add rooms of that type or reduce the scope
            of the schedule. Adding rooms takes effect on the next run.
          </p>
        </div>
      </div>
    </div>
  );
}