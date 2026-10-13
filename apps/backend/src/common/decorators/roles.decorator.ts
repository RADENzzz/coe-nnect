import { SetMetadata } from '@nestjs/common';

/**
 * Role type — kept in sync with the Postgres `user_role` enum.
 *
 * User-facing roles after the Admin→Dean consolidation:
 *   - college_dean     (top user-facing role; inherits all admin powers)
 *   - department_head  (scoped to one department)
 *
 * Internal roles (never shown in the UI, retained for dev/demo and
 * audit-history reasons — see Checkpoint v21 D3):
 *   - administrator    (hidden dev account)
 *   - viewer           (legacy; no active users, retained for enum sync)
 *
 * NOTE: `administrator` is NOT equivalent to `college_dean` for the
 * purposes of @Roles() decorators — the Dean is the role that should
 * appear in controllers. The only places that should still reference
 * `administrator` are:
 *   - the dev-only guard helper (canActAsTopRole)
 *   - seed / migration code
 */
export type UserRole =
  | 'administrator'
  | 'college_dean'
  | 'department_head'
  | 'viewer';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);