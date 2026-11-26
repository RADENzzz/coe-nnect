export interface SubjectOption {
  subjectId: string;
  subjectCode: string;
  title: string;
  lectureUnits: number;
  labUnits: number;
  /** Catalog owner. Kept for external-faculty and minor handling. */
  deptId?: string;
  /** Program departments whose prospectus requires this subject. */
  prospectusDeptIds?: string[];
  prospectusYears?: Array<{ yearLevel: number; semester: string }>;
  lectureSessionsPerWeek?: number;
  labSessionsPerWeek?: number;
}

export interface PlotSubjectCatalogRecord {
  subjectId: string;
  subjectCode: string;
  title: string;
  lectureUnits: number;
  labUnits: number;
  deptId?: string | null;
  isMinor?: boolean;
  isElective?: boolean;
  isPlaceholder?: boolean;
}

export interface PlotProgramRecord {
  programId: string;
  deptId: string;
  isActive?: boolean;
}

export interface PlotProspectusRow {
  subjectId: string;
  programId: string;
  yearLevel: number;
  semester: string;
  isActive?: boolean;
  lectureSessionsPerWeek?: number;
  labSessionsPerWeek?: number;
}

export interface PlotSubjectFilter {
  filterDept: string;
  filterYear: string;
  filterSem: string;
}

export interface PlotActor {
  role?: string | null;
  deptId?: string | number | null;
}

export interface PlotDepartmentRecord {
  deptId: string;
  deptCode: string;
  deptName: string;
}

export interface PlotScheduleDestination {
  scheduleDeptId: string;
  scheduleDeptLabel: string;
  catalogDeptLabel: string | null;
  isForeign: boolean;
}

/**
 * Mirrors the backend plot ownership rule: a department head plots into their
 * own department; college-wide roles fall back to the catalog subject owner.
 */
export function resolvePlotScheduleDeptId(
  subjectDeptId: string | number | null | undefined,
  actor: PlotActor,
): string {
  if (actor.role === 'department_head' && actor.deptId != null) {
    return String(actor.deptId);
  }
  return subjectDeptId != null ? String(subjectDeptId) : '';
}

/**
 * Human-readable provenance for the plot modal. A catalog subject can be
 * required by another department's prospectus, so the destination is the
 * schedule-owning department, not necessarily the catalog owner.
 */
export function describePlotScheduleDestination(
  subjectDeptId: string | number | null | undefined,
  actor: PlotActor,
  departments: PlotDepartmentRecord[],
  existingScheduleDeptId?: string | number | null,
): PlotScheduleDestination | null {
  if (subjectDeptId == null) return null;

  const existingDeptId =
    existingScheduleDeptId != null &&
    String(existingScheduleDeptId).trim() !== ''
      ? String(existingScheduleDeptId)
      : null;
  const scheduleDeptId =
    existingDeptId ?? resolvePlotScheduleDeptId(subjectDeptId, actor);
  if (!scheduleDeptId) return null;

  const deptLabel = (id: string) => {
    const dept = departments.find((d) => String(d.deptId) === id);
    return dept ? `[${dept.deptCode}] ${dept.deptName}` : `#${id}`;
  };

  const catalogDeptId =
    String(subjectDeptId).trim() === '' ? null : String(subjectDeptId);
  const isForeign = catalogDeptId != null && catalogDeptId !== scheduleDeptId;

  return {
    scheduleDeptId,
    scheduleDeptLabel: deptLabel(scheduleDeptId),
    catalogDeptLabel: isForeign && catalogDeptId ? deptLabel(catalogDeptId) : null,
    isForeign,
  };
}

/**
 * Manual plotting is driven by the prospectus, not by the flat subject
 * catalog. A minor can be cataloged under CPE while sitting in the BS EE
 * prospectus; its option must therefore carry the program departments so the
 * department filter can show it to the EE head.
 */
export function buildPlotSubjectOptions(
  subjects: PlotSubjectCatalogRecord[],
  prospectusRows: PlotProspectusRow[],
  programs: PlotProgramRecord[],
): SubjectOption[] {
  const programDeptById = new Map(
    programs
      .filter((program) => program.isActive !== false)
      .map((program) => [String(program.programId), String(program.deptId)]),
  );

  const rowsBySubject = new Map<string, PlotProspectusRow[]>();
  for (const row of prospectusRows) {
    if (row.isActive === false) continue;
    if (!programDeptById.has(String(row.programId))) continue;
    const key = String(row.subjectId);
    const existing = rowsBySubject.get(key);
    if (existing) existing.push(row);
    else rowsBySubject.set(key, [row]);
  }

  const options: SubjectOption[] = [];
  for (const subject of subjects) {
    const rows = rowsBySubject.get(String(subject.subjectId));
    if (!rows?.length) continue;

    const prospectusDeptIds = Array.from(
      new Set(
        rows.map((row) => programDeptById.get(String(row.programId))!),
      ),
    );

    const seenYears = new Set<string>();
    const prospectusYears: Array<{ yearLevel: number; semester: string }> = [];
    for (const row of rows) {
      const key = `${row.yearLevel}|${row.semester}`;
      if (seenYears.has(key)) continue;
      seenYears.add(key);
      prospectusYears.push({
        yearLevel: row.yearLevel,
        semester: row.semester,
      });
    }

    const sessionRow = rows.find(
      (row) =>
        row.lectureSessionsPerWeek != null ||
        row.labSessionsPerWeek != null,
    );

    options.push({
      subjectId: subject.subjectId,
      subjectCode: subject.subjectCode,
      title: subject.title,
      lectureUnits: subject.lectureUnits,
      labUnits: subject.labUnits,
      deptId: subject.deptId != null ? String(subject.deptId) : undefined,
      prospectusDeptIds,
      prospectusYears,
      lectureSessionsPerWeek: sessionRow?.lectureSessionsPerWeek ?? 1,
      labSessionsPerWeek: sessionRow?.labSessionsPerWeek ?? 1,
    });
  }

  return options;
}

export function matchesPlotSubjectFilter(
  option: SubjectOption,
  filter: PlotSubjectFilter,
): boolean {
  if (filter.filterDept) {
    const departments =
      option.prospectusDeptIds && option.prospectusDeptIds.length > 0
        ? option.prospectusDeptIds
        : option.deptId
          ? [option.deptId]
          : [];
    if (!departments.includes(filter.filterDept)) return false;
  }

  if (filter.filterYear || filter.filterSem) {
    const years = option.prospectusYears ?? [];
    if (years.length === 0) return false;
    const match = years.some((year) => {
      if (filter.filterYear && String(year.yearLevel) !== filter.filterYear) {
        return false;
      }
      if (filter.filterSem && year.semester !== filter.filterSem) return false;
      return true;
    });
    if (!match) return false;
  }

  return true;
}
