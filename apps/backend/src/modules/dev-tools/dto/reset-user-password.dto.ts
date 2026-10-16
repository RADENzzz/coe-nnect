import { IsString, MinLength, Matches } from 'class-validator';

export class ResetUserPasswordDto {
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