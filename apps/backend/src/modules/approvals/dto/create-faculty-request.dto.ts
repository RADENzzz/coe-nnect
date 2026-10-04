import {
  IsString,
  IsOptional,
  IsNumberString,
  MaxLength,
} from 'class-validator';

export class CreateFacultyRequestDto {
  @IsNumberString()
  targetDeptId: string;

  @IsOptional()
  @IsNumberString()
  facultyId?: string;

  @IsNumberString()
  subjectId: string;

  @IsNumberString()
  termId: string;

  @IsString()
  @MaxLength(1000)
  reason: string;
}