import type { SchedulingConfig } from '../types/rule-context.type';

/**
 * Canonical fallbacks for every scheduling setting the engine reads.
 *
 * These are used when a key is absent from `scheduling_setting`. The System
 * Config API exposes the same map so the UI can show and restore defaults
 * without duplicating magic numbers.
 */
export const SCHEDULING_SETTING_DEFAULTS = {
  operating_hours_start: '07:00',
  operating_hours_end: '19:00',
  daytime_priority_end_hour: '17:30',
  max_consecutive_hours: 3,
  min_break_minutes: 30,
  lunch_start: '12:00',
  lunch_end: '13:00',
  lunch_break_minutes: 60,
  lunch_break_overlap_minutes: 30,
  default_required_hours: 18,
  visiting_lecturer_max_hours: 24,
  release_hours_granularity: 3,
  lab_split_hours: 3,
  lecture_block_minutes: 90,
  end_hour_alignment_weight: 0,
} as const;

export type SchedulingSettingKey = keyof typeof SCHEDULING_SETTING_DEFAULTS;

/** The subset of defaults consumed by rules through `RuleContext.config`. */
export const DEFAULT_SCHEDULING_CONFIG: SchedulingConfig = {
  operatingHoursStart: SCHEDULING_SETTING_DEFAULTS.operating_hours_start,
  operatingHoursEnd: SCHEDULING_SETTING_DEFAULTS.operating_hours_end,
  maxConsecutiveHours: SCHEDULING_SETTING_DEFAULTS.max_consecutive_hours,
  minBreakMinutes: SCHEDULING_SETTING_DEFAULTS.min_break_minutes,
  lunchStart: SCHEDULING_SETTING_DEFAULTS.lunch_start,
  lunchEnd: SCHEDULING_SETTING_DEFAULTS.lunch_end,
  lunchBreakMinutes: SCHEDULING_SETTING_DEFAULTS.lunch_break_minutes,
  lunchBreakOverlapMinutes:
    SCHEDULING_SETTING_DEFAULTS.lunch_break_overlap_minutes,
  visitingLecturerMaxHours:
    SCHEDULING_SETTING_DEFAULTS.visiting_lecturer_max_hours,
  defaultRequiredHours: SCHEDULING_SETTING_DEFAULTS.default_required_hours,
  releaseHoursGranularity:
    SCHEDULING_SETTING_DEFAULTS.release_hours_granularity,
  labSplitHours: SCHEDULING_SETTING_DEFAULTS.lab_split_hours,
  lectureBlockMinutes: SCHEDULING_SETTING_DEFAULTS.lecture_block_minutes,
  daytimePriorityEndHour:
    SCHEDULING_SETTING_DEFAULTS.daytime_priority_end_hour,
};
