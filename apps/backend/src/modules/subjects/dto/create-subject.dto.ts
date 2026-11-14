import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsNumberString,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSubjectDto {
  @IsString()
  @MaxLength(50)
  subjectCode: string;

  @IsString()
  @MaxLength(200)
  title: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalUnits: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  lectureUnits: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  labUnits: number;

  @IsOptional()
  @IsIn([
    'lecture_room',
    'laboratory',
    'computer_lab',
    'drafting_room',
    'other',
    'any',
  ])
  requiredRoomType?: string | null;

  @IsOptional()
  @IsBoolean()
  isMinor?: boolean;

  /** Elective subjects may use total-only units and are plotted first. */
  @IsOptional()
  @IsBoolean()
  isElective?: boolean;

  /**
   * `lec_lab` (default) requires total = lecture + lab.
   * `total_only` stores only totalUnits and is valid for electives only.
   */
  @IsOptional()
  @IsIn(['lec_lab', 'total_only'])
  unitsMode?: 'lec_lab' | 'total_only';

  /** Free-text elective group used by filters and grouped dropdowns. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  electiveCategory?: string | null;

  /** Preferred year level (1-6); null means any year. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  electiveYearLevel?: number | null;

  /** Preferred semester; null means any term. */
  @IsOptional()
  @IsIn(['1st', '2nd', 'summer'])
  electiveSemester?: '1st' | '2nd' | 'summer' | null;

  @IsNumberString()
  deptId: string;
}