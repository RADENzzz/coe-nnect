import {
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateSubjectRestrictionDto {
  @IsNumberString()
  subjectId1: string;

  @IsNumberString()
  subjectId2: string;

  @IsOptional()
  @IsNumberString()
  termId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  warningMessage?: string;
}