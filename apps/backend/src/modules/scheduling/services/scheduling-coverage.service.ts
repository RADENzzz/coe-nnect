import { Injectable } from '@nestjs/common';

import { SupabaseService } from '../../../database/supabase.service';

/**
 * Prospectus coverage and unplotted-minor queries.
 *
 * These read from Supabase directly because they aggregate data across
 * prospectus, program, section, subject, and schedule tables.
 */
@Injectable()
export class SchedulingCoverageService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Find minor subjects (subject.is_minor = true) that appear in the
   * term's prospectus for the active department but have no schedule
   * rows yet.
   *
   * Used by:
   *   - The Timetable page banner
   *   - The auto-generate pre-flight check (Drop C)
   */
  async findUnplottedMinors(
    termId: string,
    deptId: string,
  ): Promise<
    Array<{
      subjectId: string;
      subjectCode: string;
      title: string;
      deptId: string | null;
      yearLevel: number | null;
      semester: string | null;
      programId: string | null;
      programCode: string | null;
    }>
  > {
    const db = this.supabase.getAdminClient();

    // ── 1. Resolve term semester ──
    const { data: term } = await db
      .from('term')
      .select('semester')
      .eq('term_id', termId)
      .maybeSingle();

    if (!term?.semester) {
      // No semester on the term → cannot determine prospectus scope.
      // Return empty (caller can decide whether to warn).
      return [];
    }
    const semester = term.semester;

    // ── 2. Programs in this department ──
    const { data: programs } = await db
      .from('program')
      .select('program_id, program_code')
      .eq('dept_id', deptId)
      .eq('is_active', true);

    const programIds = (programs ?? []).map((p) => String(p.program_id));
    if (programIds.length === 0) return [];

    // ── 3. Prospectus entries for this semester ──
    const { data: prospectusRows } = await db
      .from('prospectus')
      .select('subject_id, year_level, semester, program_id')
      .in('program_id', programIds)
      .eq('is_active', true)
      .eq('semester', semester);

    const prospectusSubjectIds = Array.from(
      new Set((prospectusRows ?? []).map((p) => String(p.subject_id))),
    );
    if (prospectusSubjectIds.length === 0) return [];

    // ── 4. Minor subjects in those prospectus entries ──
    const { data: minorSubjects } = await db
      .from('subject')
      .select('subject_id, subject_code, title, dept_id, is_minor')
      .in('subject_id', prospectusSubjectIds)
      .eq('is_minor', true)
      .eq('is_active', true);

    if (!minorSubjects || minorSubjects.length === 0) return [];

    // ── 5. Which of those already have schedule rows? ──
    const { data: plotted } = await db
      .from('schedule')
      .select('subject_id')
      .eq('term_id', termId)
      .in(
        'subject_id',
        minorSubjects.map((s) => String(s.subject_id)),
      );

    const plottedIds = new Set(
      (plotted ?? []).map((r) => String(r.subject_id)),
    );

    // ── 6. Assemble output ──
    const programCodeById = new Map(
      (programs ?? []).map((p) => [
        String(p.program_id),
        p.program_code as string,
      ]),
    );

    const result: Array<{
      subjectId: string;
      subjectCode: string;
      title: string;
      deptId: string | null;
      yearLevel: number | null;
      semester: string | null;
      programId: string | null;
      programCode: string | null;
    }> = [];

    for (const subj of minorSubjects) {
      if (plottedIds.has(String(subj.subject_id))) continue;

      const ctx = (prospectusRows ?? []).find(
        (p) => String(p.subject_id) === String(subj.subject_id),
      );
      result.push({
        subjectId: String(subj.subject_id),
        subjectCode: subj.subject_code ?? '?',
        title: subj.title ?? '',
        deptId: subj.dept_id ? String(subj.dept_id) : null,
        yearLevel: ctx?.year_level ?? null,
        semester: ctx?.semester ?? null,
        programId: ctx?.program_id ? String(ctx.program_id) : null,
        programCode: ctx?.program_id
          ? programCodeById.get(String(ctx.program_id)) ?? null
          : null,
      });
    }

    result.sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
    return result;
  }

    /**
   * Coverage indicator — compares what the prospectus expects to be
   * taught against what's actually plotted in the live term schedule.
   *
   * Scope:
   *   - Per (subject, section) pair  (Q1 = B)
   *   - Expected = prospectus entry × each matching section  (Q2 = C)
   *   - External subjects (source_dept is set) excluded
   *   - Status ignored — draft counts as plotted  (Q5)
   *   - Dept-wide always, regardless of current UI filter  (Q4)
   *
   * Returns:
   *   - totals (expected / plotted / missing / percent)
   *   - missing[]           one entry per (subject, section) pair
   *   - bySection[]         per-section rollup for the panel
   *   - byProgram[]         per-program rollup for the panel
   */
  async getCoverage(
    termId: string,
    deptId: string,
  ): Promise<{
    termId: string;
    deptId: string;
    termSemester: string | null;
    totals: {
      expected: number;
      plotted: number;
      missing: number;
      percent: number;
    };
    missing: Array<{
      subjectId: string;
      subjectCode: string;
      title: string;
      isMinor: boolean;
      sourceDept: string | null;
      programId: string;
      programCode: string | null;
      yearLevel: number;
      semester: string;
      sectionId: string;
      sectionCode: string;
      loadTypes: Array<'lecture' | 'laboratory'>;
    }>;
    bySection: Array<{
      sectionId: string;
      sectionCode: string;
      expected: number;
      plotted: number;
      missing: number;
    }>;
    byProgram: Array<{
      programId: string;
      programCode: string | null;
      expected: number;
      plotted: number;
      missing: number;
    }>;
  }> {
    const db = this.supabase.getAdminClient();

    // ── 1. Resolve term semester ──
    const { data: term } = await db
      .from('term')
      .select('semester')
      .eq('term_id', termId)
      .maybeSingle();

    const termSemester = term?.semester ?? null;
    if (!termSemester) {
      return {
        termId,
        deptId,
        termSemester: null,
        totals: { expected: 0, plotted: 0, missing: 0, percent: 100 },
        missing: [],
        bySection: [],
        byProgram: [],
      };
    }

    // ── 2. Active programs in this department ──
    const { data: programs } = await db
      .from('program')
      .select('program_id, program_code')
      .eq('dept_id', deptId)
      .eq('is_active', true);

    const programIds = (programs ?? []).map((p) => String(p.program_id));
    if (programIds.length === 0) {
      return {
        termId,
        deptId,
        termSemester,
        totals: { expected: 0, plotted: 0, missing: 0, percent: 100 },
        missing: [],
        bySection: [],
        byProgram: [],
      };
    }

    // ── 3. Active sections for those programs ──
    const { data: sections } = await db
      .from('section')
      .select('section_id, section_code, program_id, year_level')
      .in('program_id', programIds)
      .eq('is_active', true);

    const sectionRows = sections ?? [];

    // ── 4. Prospectus entries for this semester ──
    const { data: prospectusRows } = await db
      .from('prospectus')
      .select('subject_id, program_id, year_level, semester')
      .in('program_id', programIds)
      .eq('is_active', true)
      .eq('semester', termSemester);

    if (!prospectusRows || prospectusRows.length === 0) {
      return {
        termId,
        deptId,
        termSemester,
        totals: { expected: 0, plotted: 0, missing: 0, percent: 100 },
        missing: [],
        bySection: [],
        byProgram: [],
      };
    }

    // ── 5. Subjects referenced by the prospectus ──
    const prospectusSubjectIds = Array.from(
      new Set(prospectusRows.map((p) => String(p.subject_id))),
    );

    const { data: subjectRows } = await db
      .from('subject')
      .select(
        'subject_id, subject_code, title, is_minor, source_dept, lecture_units, lab_units',
      )
      .in('subject_id', prospectusSubjectIds)
      .eq('is_active', true);

    // Coverage includes ALL subjects in the prospectus — external subjects
    // included. A subject with `source_dept` set is still a required slot
    // the department must plan for (usually plotted manually with an
    // external faculty/room, or cross-listed from another college). The
    // DH needs to see it if it's unplotted.
    const subjectById = new Map<
      string,
      {
        subjectId: string;
        subjectCode: string;
        title: string;
        isMinor: boolean;
        sourceDept: string | null;
        lectureUnits: number;
        labUnits: number;
      }
    >();
    for (const s of subjectRows ?? []) {
      subjectById.set(String(s.subject_id), {
        subjectId: String(s.subject_id),
        subjectCode: s.subject_code ?? '?',
        title: s.title ?? '',
        isMinor: !!s.is_minor,
        sourceDept: (s as any).source_dept ?? null,      // ← NEW
        lectureUnits: Number(s.lecture_units ?? 0),
        labUnits: Number(s.lab_units ?? 0),
      });
    }

    // ── 6. Expand prospectus into expected (subject, section) pairs ──
    // Q2 = C: for each prospectus entry, find all sections whose
    // (program_id, year_level) match. Each matching section is one
    // expected slot.
    const expected: Array<{
      subjectId: string;
      programId: string;
      yearLevel: number;
      sectionId: string;
      sectionCode: string;
    }> = [];

    for (const p of prospectusRows) {
      const pid = String(p.program_id);
      const yr = Number(p.year_level);
      const sid = String(p.subject_id);
      if (!subjectById.has(sid)) continue; // external or inactive

      for (const sec of sectionRows) {
        if (String(sec.program_id) !== pid) continue;
        if (Number(sec.year_level ?? -1) !== yr) continue;
        expected.push({
          subjectId: sid,
          programId: pid,
          yearLevel: yr,
          sectionId: String(sec.section_id),
          sectionCode: sec.section_code ?? '?',
        });
      }
    }

    // ── 7. Load live schedule rows for the term ──
    const { data: scheduleRows } = await db
      .from('schedule')
      .select('subject_id, section_id, load_type')
      .eq('term_id', termId)
      .in(
        'subject_id',
        expected.map((e) => e.subjectId),
      );

    // Key = (subjectId, sectionId, loadType)
    const plottedKeys = new Set<string>();
    for (const r of scheduleRows ?? []) {
      if (!r.section_id || !r.subject_id) continue;
      const lt = (r.load_type ?? 'lecture') as 'lecture' | 'laboratory';
      plottedKeys.add(`${r.subject_id}::${r.section_id}::${lt}`);
    }

    // ── 8. Compute coverage (Q1 = B: subject+section pair) ──
    // A pair counts as "plotted" if ANY load type has a schedule row.
    // We also collect which load types are present so the panel can
    // hint at partial coverage.
    const programCodeById = new Map<string, string | null>(
      (programs ?? []).map((p) => [
        String(p.program_id),
        p.program_code as string | null,
      ]),
    );

    const pairKey = (subjectId: string, sectionId: string) =>
      `${subjectId}::${sectionId}`;

    const plottedPairs = new Set<string>();
    const loadTypesByPair = new Map<string, Set<'lecture' | 'laboratory'>>();
    for (const e of expected) {
      const hasLecture = plottedKeys.has(
        `${e.subjectId}::${e.sectionId}::lecture`,
      );
      const hasLab = plottedKeys.has(
        `${e.subjectId}::${e.sectionId}::laboratory`,
      );
      const s = subjectById.get(e.subjectId);
      if (!s) continue;

      const present = new Set<'lecture' | 'laboratory'>();
      if (hasLecture) present.add('lecture');
      if (hasLab) present.add('laboratory');

      // What SHOULD be present?
      const shouldLecture = s.lectureUnits > 0;
      const shouldLab = s.labUnits > 0;

      // Fully plotted only if every required load type is present.
      const fullyPlotted =
        (!shouldLecture || hasLecture) && (!shouldLab || hasLab);

      if (fullyPlotted) {
        plottedPairs.add(pairKey(e.subjectId, e.sectionId));
      }
      loadTypesByPair.set(pairKey(e.subjectId, e.sectionId), present);
    }

    // ── 9. Assemble missing list ──
    const missing: Array<{
      subjectId: string;
      subjectCode: string;
      title: string;
      isMinor: boolean;
      sourceDept: string | null;
      programId: string;
      programCode: string | null;
      yearLevel: number;
      semester: string;
      sectionId: string;
      sectionCode: string;
      loadTypes: Array<'lecture' | 'laboratory'>;
    }> = [];

    const sectionIdSet = new Set<string>();
    const programIdSet = new Set<string>();

    for (const e of expected) {
      if (plottedPairs.has(pairKey(e.subjectId, e.sectionId))) continue;
      const s = subjectById.get(e.subjectId);
      if (!s) continue;

      // Only include if subject is missing some (or all) required load types.
      // We surface all missing pairs.
      const present = loadTypesByPair.get(pairKey(e.subjectId, e.sectionId))!;
      const missingLoadTypes: Array<'lecture' | 'laboratory'> = [];
      if (s.lectureUnits > 0 && !present.has('lecture')) {
        missingLoadTypes.push('lecture');
      }
      if (s.labUnits > 0 && !present.has('laboratory')) {
        missingLoadTypes.push('laboratory');
      }
      if (missingLoadTypes.length === 0) continue;

      missing.push({
        subjectId: e.subjectId,
        subjectCode: s.subjectCode,
        title: s.title,
        isMinor: s.isMinor,
        sourceDept: s.sourceDept,
        programId: e.programId,
        programCode: programCodeById.get(e.programId) ?? null,
        yearLevel: e.yearLevel,
        semester: termSemester,
        sectionId: e.sectionId,
        sectionCode: e.sectionCode,
        loadTypes: missingLoadTypes,
      });
      sectionIdSet.add(e.sectionId);
      programIdSet.add(e.programId);
    }

    missing.sort((a, b) => {
      if (a.sectionCode !== b.sectionCode) {
        return a.sectionCode.localeCompare(b.sectionCode);
      }
      return a.subjectCode.localeCompare(b.subjectCode);
    });

    // ── 10. Per-section rollup ──
    const sectionExpected = new Map<string, number>();
    const sectionPlotted = new Map<string, number>();
    for (const e of expected) {
      sectionExpected.set(
        e.sectionId,
        (sectionExpected.get(e.sectionId) ?? 0) + 1,
      );
      if (plottedPairs.has(pairKey(e.subjectId, e.sectionId))) {
        sectionPlotted.set(
          e.sectionId,
          (sectionPlotted.get(e.sectionId) ?? 0) + 1,
        );
      }
    }

    const bySection = sectionRows
      .filter((s) => sectionExpected.has(String(s.section_id)))
      .map((s) => {
        const sid = String(s.section_id);
        const exp = sectionExpected.get(sid) ?? 0;
        const plt = sectionPlotted.get(sid) ?? 0;
        return {
          sectionId: sid,
          sectionCode: s.section_code ?? '?',
          expected: exp,
          plotted: plt,
          missing: Math.max(0, exp - plt),
        };
      })
      .sort((a, b) => a.sectionCode.localeCompare(b.sectionCode));

    // ── 11. Per-program rollup ──
    const programExpected = new Map<string, number>();
    const programPlotted = new Map<string, number>();
    for (const e of expected) {
      programExpected.set(
        e.programId,
        (programExpected.get(e.programId) ?? 0) + 1,
      );
      if (plottedPairs.has(pairKey(e.subjectId, e.sectionId))) {
        programPlotted.set(
          e.programId,
          (programPlotted.get(e.programId) ?? 0) + 1,
        );
      }
    }

    const byProgram = Array.from(programExpected.entries())
      .map(([pid, exp]) => {
        const plt = programPlotted.get(pid) ?? 0;
        return {
          programId: pid,
          programCode: programCodeById.get(pid) ?? null,
          expected: exp,
          plotted: plt,
          missing: Math.max(0, exp - plt),
        };
      })
      .sort((a, b) =>
        (a.programCode ?? '').localeCompare(b.programCode ?? ''),
      );

    // ── 12. Totals ──
    const totalExpected = expected.length;
    const totalPlotted = plottedPairs.size;
    const totalMissing = missing.length;
    const percent =
      totalExpected === 0
        ? 100
        : Math.round((totalPlotted / totalExpected) * 1000) / 10;

    return {
      termId,
      deptId,
      termSemester,
      totals: {
        expected: totalExpected,
        plotted: totalPlotted,
        missing: totalMissing,
        percent,
      },
      missing,
      bySection,
      byProgram,
    };
  }


}
