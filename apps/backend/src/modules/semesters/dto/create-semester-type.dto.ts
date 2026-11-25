import { IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

export class CreateSemesterTypeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$/, {
    message: 'code must be 1-20 letters, digits, hyphens, or underscores',
  })
  code!: string;

  @IsString()
  @Length(1, 60)
  label!: string;

  @IsString()
  @Length(1, 60)
  shortLabel!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}
