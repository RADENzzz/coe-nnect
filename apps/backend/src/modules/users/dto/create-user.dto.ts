import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsIn,
  IsNumberString,
  Matches,
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
  email!: string;

  /**
   * Matches the frontend rule enforced in AdminUsersPage and
   * mirrored in ChangePasswordDto. Prevents API-level bypass of the
   * client-side regex.
   */
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    {
      message:
        'Password must be at least 8 characters long and include at least ' +
        'one uppercase letter, one lowercase letter, one number, and one ' +
        'special character (@$!%*?&).',
    },
  )
  password!: string;

  @IsString()
  @MinLength(3)
  username!: string;

  @IsIn(ASSIGNABLE_ROLES)
  role!: AssignableRole;

  @IsOptional()
  @IsNumberString()
  deptId?: string;

  @IsOptional()
  @IsNumberString()
  facultyId?: string;
}