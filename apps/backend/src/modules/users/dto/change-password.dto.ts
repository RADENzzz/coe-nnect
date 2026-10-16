import { IsString, MinLength, Matches } from 'class-validator';

/**
 * Self-service password change. Both fields required.
 *
 * newPassword must match the SAME rule as the admin create-user form:
 *   - 8+ characters
 *   - at least one uppercase letter
 *   - at least one lowercase letter
 *   - at least one digit
 *   - at least one of @ $ ! % * ? &
 */
export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'Current password is required.' })
  currentPassword!: string;

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
  newPassword!: string;
}