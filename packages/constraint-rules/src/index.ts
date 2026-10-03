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

// Rules — overlap
export { facultyOverlapRule } from './rules/overlap/faculty-overlap.rule';
export { roomOverlapRule } from './rules/overlap/room-overlap.rule';
export { sectionOverlapRule } from './rules/overlap/section-overlap.rule';

// Rules — time
export { consecutiveBlocksRule } from './rules/time/consecutive-blocks.rule';

// Rules — faculty
export { facultyQualificationRule } from './rules/faculty/faculty-qualification.rule';

// Convenience — every rule the backend registers at boot
import { roomTypeMatchRule } from './rules/room/room-type-match.rule';
import { roomNoLabRule } from './rules/room/room-no-lab.rule';
import { facultyOverlapRule } from './rules/overlap/faculty-overlap.rule';
import { roomOverlapRule } from './rules/overlap/room-overlap.rule';
import { sectionOverlapRule } from './rules/overlap/section-overlap.rule';
import { consecutiveBlocksRule } from './rules/time/consecutive-blocks.rule';
import { facultyQualificationRule } from './rules/faculty/faculty-qualification.rule';
import type { ConstraintRule } from './types/rule.interface';

export const allRules: ConstraintRule[] = [
  roomTypeMatchRule,
  roomNoLabRule,
  facultyOverlapRule,
  roomOverlapRule,
  sectionOverlapRule,
  consecutiveBlocksRule,
  facultyQualificationRule,
];