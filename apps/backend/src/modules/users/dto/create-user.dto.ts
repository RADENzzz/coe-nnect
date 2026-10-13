import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsIn,
  IsNumberString,
} from 'class-validator';

/**
 * Roles that can be assigned to a user via the UI.
 *
 * Deliberately excludes:
 *   - 'administrator' — hidden dev role, seed-only
 *   - 'viewer'        — deprecated, no active users
 *
 * The DB enum still contains both values (see user.entity.ts), but
 * the API surface refuses them.
 */
export const ASSIGNABLE_ROLES = ['college_dean', 'department_head'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(3)
  username: string;

  @IsIn(ASSIGNABLE_ROLES)
  role: AssignableRole;

  @IsOptional()
  @IsNumberString()
  deptId?: string;

  @IsOptional()
  @IsNumberString()
  facultyId?: string;
}