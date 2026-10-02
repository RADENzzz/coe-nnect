import { IsString, IsOptional, IsNumberString } from 'class-validator';

export class PlotSubjectDto {
  @IsNumberString()
  termId: string;

  @IsNumberString()
  subjectId: string;

  @IsOptional()
  @IsNumberString()
  facultyId?: string;

  @IsOptional()
  @IsNumberString()
  roomId?: string;

  @IsOptional()
  @IsNumberString()
  timeslotId?: string;

  @IsOptional()
  @IsString()
  section?: string;

  @IsOptional()
  @IsString()
  loadType?: 'lecture' | 'laboratory' | 'other';
}