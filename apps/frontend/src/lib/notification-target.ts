import type { NotificationItem } from '../api/notifications.api';

/**
 * Notification deep-link + presentation helpers.
 *
 * A notification row carries only `entityType`, `entityId`, and a free-form
 * `payload`. This module turns that into:
 *   - an in-app URL that lands on the affected record (shell-aware),
 *   - the icon shown in the bell / inbox,
 *   - a short list of context chips (subject, section, status change, …).
 *
 * Keeping the mapping in one place means the bell, inbox, and toast all
 * resolve the same destination.
 */

export type ShellBase = '' | '/dean';

/** Which shell a pathname belongs to. `''` means the DH shell. */
export function shellForPath(pathname: string): ShellBase {
  return pathname === '/dean' || pathname.startsWith('/dean/') ? '/dean' : '';
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function href(
  shell: ShellBase,
  path: string,
  params: Record<string, string | null> = {},
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, value);
  }
  const query = qs.toString();
  return `${shell}${path}${query ? `?${query}` : ''}`;
}

/** Human labels for roles that can appear in a `user.*` payload. */
const ROLE_LABELS: Record<string, string> = {
  administrator: 'Administrator',
  college_dean: 'College Dean',
  college_secretary: 'College Secretary',
  department_head: 'Department Head',
  viewer: 'Viewer',
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role.replace(/_/g, ' ');
}

/**
 * Where clicking a notification should take the user.
 *
 * Resolution order:
 *   1. trigger key (most precise — some triggers share an entity type),
 *   2. entity type fallback,
 *   3. `null` when there is nothing better than the inbox itself.
 */
export function notificationHref(
  item: NotificationItem,
  shell: ShellBase = '',
): string | null {
  const id = asString(item.entityId);
  const payload = item.payload ?? {};

  switch (item.triggerKey) {
    case 'schedule.status_changed':
    case 'schedule.flagged':
    case 'schedule.conflict_detected':
      return href(shell, '/timetable', { focus: id });

    case 'request.submitted':
    case 'request.approved':
    case 'request.rejected':
    case 'request.cancelled':
      return href(shell, shell === '/dean' ? '/requests' : '/approvals', {
        request: id,
      });

    case 'faculty.overloaded':
      return href(shell, '/faculty', { faculty: id });

    case 'term.activated':
      // Only the Dean shell has System Settings → Terms.
      return shell === '/dean'
        ? href(shell, '/system-settings', { termId: id })
        : href(shell, '/timetable');

    case 'prospectus.imported':
      return id ? href(shell, `/import/${id}`) : href(shell, '/import');

    case 'auto_generate.started':
      return href(shell, '/timetable');

    case 'auto_generate.finished':
      // The timetable page auto-resumes the pending preview on ?preview=1.
      return href(shell, '/timetable', { preview: '1' });

    case 'auto_generate.failed': {
      const reason = asString(payload.reason);
      if (reason === 'insufficient_rooms' || Array.isArray(payload.deficits)) {
        return href(shell, '/reports/rooms', { dept: asString(payload.deptId) });
      }
      return href(shell, '/timetable');
    }

    case 'room_sufficiency.below_threshold':
      return href(shell, '/reports/rooms', { dept: asString(payload.deptId) });

    case 'user.created':
    case 'user.deactivated':
      return href(shell, '/users', { user: id });

    default:
      break;
  }

  // Fallback for notifications whose trigger has no dedicated mapping
  // (e.g. rows created before the trigger list was finalised).
  switch (item.entityType) {
    case 'schedule':
      return href(shell, '/timetable', { focus: id });
    case 'faculty_request':
      return href(shell, shell === '/dean' ? '/requests' : '/approvals', {
        request: id,
      });
    case 'faculty':
      return href(shell, '/faculty', { faculty: id });
    case 'term':
      return shell === '/dean'
        ? href(shell, '/system-settings', { termId: id })
        : href(shell, '/timetable');
    case 'prospectus_pdf':
      return id ? href(shell, `/import/${id}`) : href(shell, '/import');
    case 'user':
      return href(shell, '/users', { user: id });
    default:
      return null;
  }
}

/** Material Symbol shown next to a notification. */
export function notificationIcon(item: NotificationItem): string {
  switch (item.triggerKey) {
    case 'schedule.flagged':
      return 'flag';
    case 'schedule.conflict_detected':
      return 'report_problem';
    case 'schedule.status_changed':
      return 'event';
    case 'request.submitted':
      return 'swap_horiz';
    case 'request.approved':
      return 'task_alt';
    case 'request.rejected':
      return 'cancel';
    case 'request.cancelled':
      return 'undo';
    case 'auto_generate.started':
    case 'auto_generate.finished':
    case 'auto_generate.failed':
      return 'auto_awesome';
    case 'term.activated':
      return 'event_available';
    case 'prospectus.imported':
      return 'upload_file';
    case 'faculty.overloaded':
      return 'groups';
    case 'room_sufficiency.below_threshold':
      return 'meeting_room';
    case 'user.created':
    case 'user.deactivated':
      return 'admin_panel_settings';
    default:
      return notificationCategoryIcon(item.category);
  }
}

function notificationCategoryIcon(category: string): string {
  switch (category) {
    case 'schedule':
      return 'event';
    case 'approvals':
      return 'task_alt';
    case 'scheduling':
      return 'auto_awesome';
    case 'academic':
      return 'school';
    case 'faculty':
      return 'person';
    case 'facility':
      return 'meeting_room';
    case 'admin':
      return 'admin_panel_settings';
    default:
      return 'notifications';
  }
}

export interface NotificationChip {
  icon: string;
  label: string;
  title?: string;
}

/**
 * Short context chips rendered under the notification body.
 * Only fields that are actually present are rendered, so old rows and
 * new rows both look right.
 */
export function notificationChips(item: NotificationItem): NotificationChip[] {
  const payload = item.payload ?? {};
  const chips: NotificationChip[] = [];

  const push = (icon: string, label: string | null, title?: string) => {
    if (!label) return;
    if (chips.some((chip) => chip.label === label)) return;
    chips.push({ icon, label, title });
  };

  const subjectCode = asString(payload.subjectCode);
  push(
    'menu_book',
    subjectCode,
    asString(payload.subjectTitle) ?? undefined,
  );

  const sectionCode = asString(payload.sectionCode);
  push('view_module', sectionCode);

  // Human-readable reasons only — machine reasons such as
  // `solver_unavailable` are not useful to the reader.
  const reason = asString(payload.reason);
  if (reason && /\s/.test(reason) && reason.length <= 60) {
    push('flag', reason);
  }

  const requestingDept = asString(payload.requestingDeptCode);
  const targetDept = asString(payload.targetDeptCode);
  if (requestingDept && targetDept) {
    push('swap_horiz', `${requestingDept} → ${targetDept}`);
  } else {
    push('corporate_fare', asString(payload.deptCode));
  }

  const previousStatus = asString(payload.previousStatus);
  const newStatus = asString(payload.newStatus);
  if (previousStatus && newStatus) {
    push('swap_horiz', `${previousStatus} → ${newStatus}`);
  }

  const day = asString(payload.dayOfWeek);
  const start = asString(payload.startTime);
  const end = asString(payload.endTime);
  if (day) {
    push(
      'schedule',
      [day, start && end ? `${start}–${end}` : start ?? end]
        .filter(Boolean)
        .join(' '),
    );
  }

  push('meeting_room', asString(payload.roomCode));

  const totalHours = asNumber(payload.totalHours);
  const requiredHours = asNumber(payload.requiredHours);
  if (totalHours !== null) {
    push(
      'hourglass_top',
      `${totalHours}h${requiredHours !== null ? ` / ${requiredHours}h cap` : ''}`,
    );
  }

  const scheduleCount = asNumber(payload.scheduleCount);
  if (scheduleCount !== null) {
    push(
      'event',
      `${scheduleCount} ${scheduleCount === 1 ? 'entry' : 'entries'}`,
    );
  }

  push('calendar_month', asString(payload.termName));
  push('picture_as_pdf', asString(payload.fileName));
  push('school', asString(payload.programCode));
  push('mail', asString(payload.email));

  const role = asString(payload.role);
  if (role && !previousStatus && !subjectCode && !reason) {
    push('admin_panel_settings', roleLabel(role));
  }

  return chips.slice(0, 4);
}
