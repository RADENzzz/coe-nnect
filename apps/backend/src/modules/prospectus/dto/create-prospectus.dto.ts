import {
  IsNumberString,
  IsInt,
  IsOptional,
  Min,
  Max,
  IsString,
  Matches,
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

  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{0,19}$/, {
    message: 'semester must be a lowercase code of 1-20 letters, digits, hyphens, or underscores',
  })
  semester: string;

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