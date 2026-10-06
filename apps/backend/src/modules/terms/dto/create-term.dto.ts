import { IsNotEmpty, IsString, Matches, IsBoolean, IsOptional } from 'class-validator';

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

  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate must be in the format YYYY-MM-DD.',
  })
  startDate!: string;

  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'endDate must be in the format YYYY-MM-DD.',
  })
  endDate!: string;

  @IsOptional()
  @IsBoolean()
  setActive?: boolean;
}