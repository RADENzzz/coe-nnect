import { IsEmail, IsOptional, MaxLength } from 'class-validator';

export class SetRecoveryEmailDto {
  /**
   * `null` or an omitted value removes the recovery email. The controller
   * also exposes DELETE /me for clients that prefer an explicit removal.
   */
  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(254, { message: 'Email address is too long.' })
  recoveryEmail?: string | null;
}
