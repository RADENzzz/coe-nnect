import {
  IsString,
  IsOptional,
  IsNumberString,
  IsIn,
  Matches,
  MaxLength,
} from 'class-validator';

export class PlotSubjectDto {
  @IsNumberString()
  termId: string;

  @IsNumberString()
  subjectId: string;

  /**
   * System faculty ID. Either this OR externalFacultyName is required.
   * Enforced at the service layer.
   */
  @IsOptional()
  @IsNumberString()
  facultyId?: string;

  /**
   * Free-text name of a faculty member outside the system
   * (Math/GenEd/EPIC professors, visiting lecturers, etc.).
   * Either this OR facultyId is required.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalFacultyName?: string;

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