import { IsString, MinLength } from 'class-validator';

export class VerifyRecoveryEmailDto {
  @IsString()
  @MinLength(16)
  token!: string;
}
