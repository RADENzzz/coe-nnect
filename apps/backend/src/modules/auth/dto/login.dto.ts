import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  /** Solved Cap challenge token from the login widget. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  capToken: string;
}
