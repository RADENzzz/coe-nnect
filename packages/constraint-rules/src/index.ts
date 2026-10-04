// Public API for @coe-nnect/constraint-rules

// Types
export type {
  RuleResult,
  RuleEvaluation,
  RuleCategory,
} from './types/rule-result.type';
export type {
  RuleContext,
  SubjectContext,
  SectionContext,
  FacultyContext,
  RoomContext,
  TimeSlotContext,
  ScheduleEntryContext,
  MinorBlockContext,
  FacultyCommitmentContext,
  SchedulingConfig,
} from './types/rule-context.type';
export type { ConstraintRule } from './types/rule.interface';

// Engine + registry
export {
  runRules,
  hasHardFailures,
  getHardFailures,
  getSoftWarnings,
  evaluate,
} from './engine';
export type { EngineResult } from './engine';
export { RuleRegistry } from './registry';

// Utils
export { toMinutes, minutesToTime, timesOverlap } from './utils/time.util';

// Rules — room
export { roomTypeMatchRule } from './rules/room/room-type-match.rule';
export { roomNoLabRule } from './rules/room/room-no-lab.rule';
export { labPriorityRule } from './rules/room/lab-priority.rule';
export { roomOwnershipRule } from './rules/room/room-ownership.rule';
export { labHostsLectureRule } from './rules/room/lab-hosts-lecture.rule';
export { servicingPriorityRule } from './rules/room/servicing-priority.rule';
export { cohortOverflowRule } from './rules/room/cohort-overflow.rule';

// Rules — overlap
export { facultyOverlapRule } from './rules/overlap/faculty-overlap.rule';
export { roomOverlapRule } from './rules/overlap/room-overlap.rule';
export { sectionOverlapRule } from './rules/overlap/section-overlap.rule';

// Rules — time
export { consecutiveBlocksRule } from './rules/time/consecutive-blocks.rule';
export { blockDurationSanityRule } from './rules/time/block-duration-sanity.rule';
export { minorScheduleBlockRule } from './rules/time/minor-schedule-block.rule';
export { dayPairingRule } from './rules/time/day-pairing.rule';
export { lunchBreakRule } from './rules/time/lunch-break.rule';
export { daytimePriorityRule } from './rules/time/daytime-priority.rule';

// Rules — faculty
export { facultyQualificationRule } from './rules/faculty/faculty-qualification.rule';
export { workloadOverloadRule } from './rules/faculty/workload-overload.rule';
export { visitingLecturerCapRule } from './rules/faculty/visiting-lecturer-cap.rule';

// Rules — lab
export { noBackToBackLabsRule } from './rules/lab/no-back-to-back-labs.rule';
export { unsplittable1UnitLabRule } from './rules/lab/unsplittable-1unit-lab.rule';
export { splittable2UnitLabRule } from './rules/lab/splittable-2unit-lab.rule';

// Rules — subject
export { loadTypeMatchRule } from './rules/subject/load-type-match.rule';

// Convenience — every rule the backend registers at boot
import { roomTypeMatchRule } from './rules/room/room-type-match.rule';
import { roomNoLabRule } from './rules/room/room-no-lab.rule';
import { facultyOverlapRule } from './rules/overlap/faculty-overlap.rule';
import { roomOverlapRule } from './rules/overlap/room-overlap.rule';
import { sectionOverlapRule } from './rules/overlap/section-overlap.rule';
import { consecutiveBlocksRule } from './rules/time/consecutive-blocks.rule';
import { facultyQualificationRule } from './rules/faculty/faculty-qualification.rule';
import { noBackToBackLabsRule } from './rules/lab/no-back-to-back-labs.rule';
import { unsplittable1UnitLabRule } from './rules/lab/unsplittable-1unit-lab.rule';
import { splittable2UnitLabRule } from './rules/lab/splittable-2unit-lab.rule';
import { blockDurationSanityRule } from './rules/time/block-duration-sanity.rule';
import { workloadOverloadRule } from './rules/faculty/workload-overload.rule';
import { visitingLecturerCapRule } from './rules/faculty/visiting-lecturer-cap.rule';
import { loadTypeMatchRule } from './rules/subject/load-type-match.rule';
import { dayPairingRule } from './rules/time/day-pairing.rule';
import { minorScheduleBlockRule } from './rules/time/minor-schedule-block.rule';
import { lunchBreakRule } from './rules/time/lunch-break.rule';
import { daytimePriorityRule } from './rules/time/daytime-priority.rule';
import type { ConstraintRule } from './types/rule.interface';
import { labPriorityRule } from './rules/room/lab-priority.rule';
import { roomOwnershipRule } from './rules/room/room-ownership.rule';
import { labHostsLectureRule } from './rules/room/lab-hosts-lecture.rule';
import { servicingPriorityRule } from './rules/room/servicing-priority.rule';
import { cohortOverflowRule } from './rules/room/cohort-overflow.rule';

export const allRules: ConstraintRule[] = [
  roomTypeMatchRule,
  roomNoLabRule,
  labPriorityRule,            
  roomOwnershipRule,          
  labHostsLectureRule,        
  servicingPriorityRule,
  cohortOverflowRule,
  facultyOverlapRule,
  roomOverlapRule,
  sectionOverlapRule,
  consecutiveBlocksRule,
  facultyQualificationRule,
  noBackToBackLabsRule,
  unsplittable1UnitLabRule,
  splittable2UnitLabRule,
  blockDurationSanityRule,
  workloadOverloadRule,
  visitingLecturerCapRule,
  loadTypeMatchRule,
  minorScheduleBlockRule,
  dayPairingRule,
  lunchBreakRule,
  daytimePriorityRule,
];