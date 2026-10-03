import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';
import { toMinutes } from '../../utils/time.util';

/**
 * H-6: Back-to-back laboratory sessions are strictly prohibited.
 *
 * A "back-to-back" pair is two lab blocks on the same day where
 * one ends exactly at (or within `minBreakMinutes` of) the other's
 * start. The check applies to both the section and the faculty,
 * since the PDF rule says the risk is both student fatigue and
 * instructor overload.
 *
 * Source: WMSU analysis PDF, section 5 ("No Consecutive Laboratories").
 */
export const noBackToBackLabsRule: ConstraintRule = {
  id: 'H-6',
  name: 'No Back-to-Back Labs',
  description:
    'Two laboratory sessions cannot be scheduled back-to-back on the same day for the same section or faculty.',
  type: 'hard',
  category: 'time',

  validate(ctx: RuleContext): RuleResult {
    const {
      subject,
      section,
      faculty,
      timeSlot,
      existingSchedule,
      excludeScheduleId,
      config,
    } = ctx;

    // Only applies when the candidate is a lab session.
    const candidateIsLab = subject.labUnits > 0;
    if (!candidateIsLab) return { status: 'pass' };

    const candidateStart = toMinutes(timeSlot.startTime);
    const candidateEnd = toMinutes(timeSlot.endTime);
    const minBreak = config.minBreakMinutes;

    // Check section side.
    if (section.sectionCode) {
      const conflict = findAdjacent(
        existingSchedule,
        excludeScheduleId,
        timeSlot.dayOfWeek,
        (r) => r.section === section.sectionCode,
        candidateStart,
        candidateEnd,
        minBreak,
      );
      if (conflict) {
        return {
          status: 'fail',
          reason: `Section ${section.sectionCode} already has a lab session on ${timeSlot.dayOfWeek} ending at ${conflict.endTime}, too close to this one.`,
          metadata: {
            conflictingScheduleId: conflict.scheduleId,
            scope: 'section',
          },
        };
      }
    }

    // Check faculty side.
    if (faculty) {
      const conflict = findAdjacent(
        existingSchedule,
        excludeScheduleId,
        timeSlot.dayOfWeek,
        (r) => r.facultyId === faculty.facultyId,
        candidateStart,
        candidateEnd,
        minBreak,
      );
      if (conflict) {
        return {
          status: 'fail',
          reason: `${faculty.lastName}, ${faculty.firstName} already has a lab session on ${timeSlot.dayOfWeek} ending at ${conflict.endTime}, too close to this one.`,
          metadata: {
            conflictingScheduleId: conflict.scheduleId,
            scope: 'faculty',
          },
        };
      }
    }

    return { status: 'pass' };
  },
};

/**
 * Returns the first existing lab schedule entry for the given scope
 * that is too close to the candidate (gap < minBreakMinutes).
 */
function findAdjacent(
  existing: RuleContext['existingSchedule'],
  excludeScheduleId: string | undefined,
  day: string,
  matches: (r: RuleContext['existingSchedule'][number]) => boolean,
  candidateStart: number,
  candidateEnd: number,
  minBreakMinutes: number,
): RuleContext['existingSchedule'][number] | null {
  for (const row of existing) {
    if (excludeScheduleId && row.scheduleId === excludeScheduleId) continue;
    if (row.dayOfWeek !== day) continue;
    if (row.loadType !== 'laboratory') continue;
    if (!matches(row)) continue;

    const rowStart = toMinutes(row.startTime);
    const rowEnd = toMinutes(row.endTime);

    // Skip anything that overlaps — that's H-1/H-3's job.
    if (rowStart < candidateEnd && candidateStart < rowEnd) continue;

    // Adjacency: gap between the two blocks < minBreak.
    const gap = rowStart >= candidateEnd
      ? rowStart - candidateEnd
      : candidateStart - rowEnd;

    if (gap < minBreakMinutes) {
      return row;
    }
  }
  return null;
}