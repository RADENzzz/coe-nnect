import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RenameUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      'Username may only contain letters, numbers, dots, underscores, and hyphens.',
  })
  newUsername!: string;
}