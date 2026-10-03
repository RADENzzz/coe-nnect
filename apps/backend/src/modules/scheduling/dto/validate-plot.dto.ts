import {
  IsString,
  IsOptional,
  IsNumberString,
  IsIn,
  Matches,
} from 'class-validator';

export class ValidatePlotDto {
  @IsOptional()
  @IsNumberString()
  excludeId?: string; // for edit case — exclude this entry from overlap check

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
  @IsString()
  section?: string;

  @IsOptional()
  @IsIn(['lecture', 'laboratory', 'other'])
  loadType?: 'lecture' | 'laboratory' | 'other';

  @IsIn([
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ])
  dayOfWeek: string;

  @Matches(/^\d{2}:\d{2}(:\d{2})?$/)
  startTime: string;

  @Matches(/^\d{2}:\d{2}(:\d{2})?$/)
  endTime: string;
}