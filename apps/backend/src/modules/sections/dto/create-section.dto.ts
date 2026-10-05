import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateSectionDto {
  @IsString()
  @MaxLength(50)
  sectionCode: string;

  @IsOptional()
  @IsString()
  programId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  yearLevel?: number;

  /**
   * Advisory only. Used by rule S-8 (Cohort Overflow) as a soft signal —
   * it does NOT enforce any enrollment decision. Section enrollment in
   * practice is not homogeneous, so this figure is a rough indicator.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  studentCount?: number;
}