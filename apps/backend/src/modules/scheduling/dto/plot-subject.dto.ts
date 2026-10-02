import {
  IsString,
  IsOptional,
  IsNumberString,
  IsIn,
  Matches,
} from 'class-validator';

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

  @Matches(/^\d{2}:\d{2}(:\d{2})?$/, {
    message: 'startTime must be in HH:MM or HH:MM:SS format',
  })
  startTime: string;

  @Matches(/^\d{2}:\d{2}(:\d{2})?$/, {
    message: 'endTime must be in HH:MM or HH:MM:SS format',
  })
  endTime: string;
}