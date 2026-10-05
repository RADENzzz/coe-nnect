import { SetMetadata } from '@nestjs/common';

export const AUDITABLE_KEY = 'auditable';

export interface AuditableOptions {
  /** Action label written to audit_trail.action, e.g. "schedule.create" */
  action: string;
  /** Source system label, e.g. "Scheduling", "Approvals", "Users" */
  source: string;
}

export const Auditable = (options: AuditableOptions) =>
  SetMetadata(AUDITABLE_KEY, options);