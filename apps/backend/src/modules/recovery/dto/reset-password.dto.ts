import { IsString, Matches, MinLength } from 'class-validator';

/**
 * Public password reset. Uses the same password rule as CreateUserDto and
 * ChangePasswordDto so a reset cannot downgrade the account policy.
 */
export class ResetPasswordDto {
  @IsString()
  @MinLength(16)
  token!: string;

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
