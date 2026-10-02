import { SetMetadata } from '@nestjs/common';

export type UserRole = 'administrator' | 'college_dean' | 'department_head' | 'viewer';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);