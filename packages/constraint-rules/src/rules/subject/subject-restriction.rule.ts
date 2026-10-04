import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';
import { toMinutes, timesOverlap } from '../../utils/time.util';

/**
 * S-11: Subjects linked by a subject_restriction must not have
 * overlapping time slots in the same term. The intent is to protect
 * irregular students who are taking both subjects from a scheduling
 * clash.
 *
 * The restriction is global per term — it does not depend on the
 * section. If a partner subject is already plotted at an overlapping
 * time, this rule warns.
 *
 * Soft warning only: department heads can override, and the SRS
 * describes these as advisory.
 *
 * Source: SRS FR 2.1.2.6 (Manage Subject Restriction),
 *         PM's taxonomy, Optional flag "Restricted subjects must not
 *         conflict in time slots."
 */
export const subjectRestrictionRule: ConstraintRule = {
  id: 'S-11',
  name: 'Subject Restriction',
  description:
    'Restricted subject pairs must not have overlapping time slots.',
  type: 'soft',
  category: 'subject',

  validate(ctx: RuleContext): RuleResult {
    const {
      subject,
      timeSlot,
      existingSchedule,
      subjectRestrictions,
      excludeScheduleId,
    } = ctx;

    if (!subjectRestrictions || subjectRestrictions.length === 0) {
      return { status: 'pass' };
    }

    // Which subject IDs is our candidate restricted against?
    const partnerIds = new Set<string>();
    for (const r of subjectRestrictions) {
      if (r.subjectIdA === subject.subjectId) partnerIds.add(r.subjectIdB);
      if (r.subjectIdB === subject.subjectId) partnerIds.add(r.subjectIdA);
    }
    if (partnerIds.size === 0) return { status: 'pass' };

    const candidateStart = toMinutes(timeSlot.startTime);
    const candidateEnd = toMinutes(timeSlot.endTime);

    for (const row of existingSchedule) {
      if (excludeScheduleId && row.scheduleId === excludeScheduleId) continue;
      if (row.dayOfWeek !== timeSlot.dayOfWeek) continue;
      if (!partnerIds.has(row.subjectId)) continue;

      const rowStart = toMinutes(row.startTime);
      const rowEnd = toMinutes(row.endTime);

      if (timesOverlap(candidateStart, candidateEnd, rowStart, rowEnd)) {
        const restriction = subjectRestrictions.find(
          (r) =>
            (r.subjectIdA === subject.subjectId &&
              r.subjectIdB === row.subjectId) ||
            (r.subjectIdB === subject.subjectId &&
              r.subjectIdA === row.subjectId),
        );
        const warningMessage = restriction?.warningMessage;
        return {
          status: 'warn',
          reason:
            warningMessage ??
            `${subject.subjectCode} and a restricted partner subject (id ${row.subjectId}) overlap on ${timeSlot.dayOfWeek} from ${row.startTime} to ${row.endTime}. Irregular students may not be able to take both.`,
          metadata: {
            restrictedSubjectId: row.subjectId,
            conflictingScheduleId: row.scheduleId,
          },
        };
      }
    }

    return { status: 'pass' };
  },
};