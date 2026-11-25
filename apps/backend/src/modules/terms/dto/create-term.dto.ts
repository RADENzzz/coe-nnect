import {
  IsNotEmpty,
  IsString,
  Matches,
  IsBoolean,
  IsOptional,
} from 'class-validator';

export class CreateTermDto {
  @IsNotEmpty()
  @IsString()
  termName!: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{4}$/, {
    message: 'schoolYear must be in the format YYYY-YYYY (e.g. 2026-2027).',
  })
  schoolYear!: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate must be in the format YYYY-MM-DD.',
  })
  startDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'endDate must be in the format YYYY-MM-DD.',
  })
  endDate?: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{0,19}$/, {
    message: 'semester must be a lowercase code of 1-20 letters, digits, hyphens, or underscores',
  })
  semester!: string;

  @IsOptional()
  @IsBoolean()
  setActive?: boolean;
}