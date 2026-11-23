import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * A slot is filled either with an existing elective (`subjectId`) or by
 * typing a real course code, which creates/saves the elective automatically.
 * Exactly one of the two modes must be supplied.
 */
export class FillSlotDto {
  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  newSubjectCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  newSubjectTitle?: string;
}
