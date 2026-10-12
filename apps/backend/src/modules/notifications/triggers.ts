/**
 * Canonical list of notification triggers.
 *
 * Adding a new trigger:
 *   1. Add it here
 *   2. Fire it via NotificationDispatcherService.dispatch(...)
 *   3. It automatically appears in the user's Notification Settings tab
 *
 * Removing a trigger:
 *   1. Remove it here
 *   2. Any notification rows for it remain valid (trigger_key is a free string)
 *   3. Users' stored settings for it become orphaned (harmless; can be cleaned up by a cron)
 */

export type TriggerCategory =
  | 'schedule'
  | 'approvals'
  | 'scheduling'
  | 'academic'
  | 'faculty'
  | 'facility'
  | 'admin';

export interface TriggerMeta {
  key: string;
  label: string;
  description: string;
  category: TriggerCategory;
  /** Default enabled state for a new user (all true today). */
  defaultEnabled: boolean;
}

export const TRIGGERS: TriggerMeta[] = [
  // ── Schedule ──
  {
    key: 'schedule.status_changed',
    label: 'Schedule status changed',
    description:
      'When a schedule entry moves to a different status (draft, review, finalized, published).',
    category: 'schedule',
    defaultEnabled: true,
  },
  {
    key: 'schedule.flagged',
    label: 'Schedule entry flagged',
    description:
      'When someone flags a schedule entry for review.',
    category: 'schedule',
    defaultEnabled: true,
  },
  {
    key: 'schedule.conflict_detected',
    label: 'Conflict detected in schedule',
    description:
      'When a hard conflict is detected on a schedule entry.',
    category: 'schedule',
    defaultEnabled: true,
  },

  // ── Approvals ──
  {
    key: 'request.submitted',
    label: 'Cross-dept request submitted',
    description:
      'When a department head requests faculty from another department.',
    category: 'approvals',
    defaultEnabled: true,
  },
  {
    key: 'request.approved',
    label: 'Cross-dept request approved',
    description:
      'When a cross-department faculty request is approved.',
    category: 'approvals',
    defaultEnabled: true,
  },
  {
    key: 'request.rejected',
    label: 'Cross-dept request rejected',
    description:
      'When a cross-department faculty request is rejected.',
    category: 'approvals',
    defaultEnabled: true,
  },
  {
    key: 'request.cancelled',
    label: 'Cross-dept request cancelled',
    description:
      'When a cross-department faculty request is cancelled.',
    category: 'approvals',
    defaultEnabled: true,
  },

  // ── Scheduling (auto-generate) ──
  {
    key: 'auto_generate.started',
    label: 'Auto-generate started',
    description:
      'When the solver starts generating a schedule for your department.',
    category: 'scheduling',
    defaultEnabled: true,
  },
  {
    key: 'auto_generate.finished',
    label: 'Auto-generate finished',
    description:
      'When the solver finishes generating a schedule and it is ready to review.',
    category: 'scheduling',
    defaultEnabled: true,
  },
  {
    key: 'auto_generate.failed',
    label: 'Auto-generate failed',
    description:
      'When the solver cannot produce a valid schedule.',
    category: 'scheduling',
    defaultEnabled: true,
  },

  // ── Academic ──
  {
    key: 'term.activated',
    label: 'New term activated',
    description:
      'When an administrator activates a new academic term.',
    category: 'academic',
    defaultEnabled: true,
  },
  {
    key: 'prospectus.imported',
    label: 'Prospectus imported',
    description:
      'When a prospectus PDF import is committed.',
    category: 'academic',
    defaultEnabled: true,
  },

  // ── Faculty ──
  {
    key: 'faculty.overloaded',
    label: 'Faculty workload exceeds cap',
    description:
      'When a faculty member is assigned more than their required hours.',
    category: 'faculty',
    defaultEnabled: true,
  },

  // ── Facility ──
  {
    key: 'room_sufficiency.below_threshold',
    label: 'Room capacity below threshold',
    description:
      'When room availability falls short of departmental demand.',
    category: 'facility',
    defaultEnabled: true,
  },

  // ── Admin ──
  {
    key: 'user.created',
    label: 'User account created',
    description:
      'When an administrator creates a new user account.',
    category: 'admin',
    defaultEnabled: true,
  },
  {
    key: 'user.deactivated',
    label: 'User account deactivated',
    description:
      'When a user account is deactivated.',
    category: 'admin',
    defaultEnabled: true,
  },
];

/** Fast lookup map: trigger_key → metadata. */
export const TRIGGER_MAP: Map<string, TriggerMeta> = new Map(
  TRIGGERS.map((t) => [t.key, t]),
);

/** Set of all valid trigger keys, for validation. */
export const TRIGGER_KEYS: Set<string> = new Set(TRIGGERS.map((t) => t.key));

/** Grouped by category, for rendering the settings tab. */
export const TRIGGERS_BY_CATEGORY: Record<TriggerCategory, TriggerMeta[]> =
  TRIGGERS.reduce(
    (acc, t) => {
      (acc[t.category] ??= []).push(t);
      return acc;
    },
    {} as Record<TriggerCategory, TriggerMeta[]>,
  );

/** Human-readable category labels for the settings UI. */
export const CATEGORY_LABELS: Record<TriggerCategory, string> = {
  schedule: 'Schedule',
  approvals: 'Approvals',
  scheduling: 'Auto-generate',
  academic: 'Academic',
  faculty: 'Faculty',
  facility: 'Facilities',
  admin: 'Administration',
};