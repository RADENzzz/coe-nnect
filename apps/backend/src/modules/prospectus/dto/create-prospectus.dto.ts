import {
  IsNumberString,
  IsInt,
  IsOptional,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProspectusDto {
  @IsNumberString()
  programId: string;

  @IsNumberString()
  subjectId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  yearLevel: number;

  @IsIn(['1st', '2nd', 'summer'])
  semester: '1st' | '2nd' | 'summer';

  // ── Multi-session scheduling (Phase 2) ──

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  lectureSessionsPerWeek?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(240)
  lectureMinutesPerSession?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  labSessionsPerWeek?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(300)
  labMinutesPerSession?: number;
}