import { IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateQualificationDto {
  @IsNumberString()
  subjectId: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  sourceSystem?: string;
}