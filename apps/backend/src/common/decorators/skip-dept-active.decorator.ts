import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key used by DepartmentActiveGuard to skip enforcement.
 * Set on a controller or route to exempt it from the dept-active check.
 *
 * Legitimate uses:
 *   - `/v1/auth/me` — the frontend needs to read dept_active even when
 *      the DH is walled, so it can decide whether to render the wall.
 *   - Any future "reactivate me" self-service endpoint.
 *
 * Do NOT apply this to scheduling / approvals / subject-mutation routes.
 */
export const SKIP_DEPT_ACTIVE_KEY = 'skipDeptActive';

export const SkipDeptActive = () => SetMetadata(SKIP_DEPT_ACTIVE_KEY, true);