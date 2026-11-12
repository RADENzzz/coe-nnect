import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReauthDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  password: string;
}
