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

  /**
   * Internal room ID. Either this OR externalRoomName is required
   * (at least one of them). Enforced by chk_schedule_room_or_external.
   */
  @IsOptional()
  @IsNumberString()
  roomId?: string;

  /**
   * Free-text label for a room that isn't in the `room` table —
   * e.g. another college's room for a minor subject, or a temporary
   * space during renovations.
   *
   * When set, room rules skip (R-1, R-3, R-4, S-5, S-6, S-8, S-10, H-2).
   * May coexist with roomId (re-plot case).
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalRoomName?: string;

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