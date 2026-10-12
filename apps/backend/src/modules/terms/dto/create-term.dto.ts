import {
  IsNotEmpty,
  IsString,
  Matches,
  IsBoolean,
  IsOptional,
  IsIn,
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

  @IsNotEmpty()
  @IsIn(['1st', '2nd', 'summer'], {
    message: 'semester must be one of: 1st, 2nd, summer',
  })
  semester!: '1st' | '2nd' | 'summer';

  @IsOptional()
  @IsBoolean()
  setActive?: boolean;
}