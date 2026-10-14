import {
  IsOptional,
  IsString,
  IsIn,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateScheduleDto {
  @IsOptional()
  @IsIn([
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ])
  dayOfWeek?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/, {
    message: 'startTime must be in HH:MM or HH:MM:SS format',
  })
  startTime?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/, {
    message: 'endTime must be in HH:MM or HH:MM:SS format',
  })
  endTime?: string;

  @IsOptional()
  @IsString()
  roomId?: string;

  /**
   * System faculty ID.
   * Send `null` to explicitly clear the assignment.
   * Sending a value clears externalFacultyName automatically.
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  facultyId?: string | null;

  /**
   * Free-text name of a faculty member outside the system.
   * Send `null` to explicitly clear.
   * Sending a value clears facultyId automatically.
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  externalFacultyName?: string | null;

  @IsOptional()
  @IsIn(['lecture', 'laboratory', 'other'])
  loadType?: 'lecture' | 'laboratory' | 'other';

  /**
   * Section code, e.g. "CpE-1A".
   * Send `null` to explicitly clear the section assignment.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  section?: string | null;

  /**
   * Section ID (bigint as string).
   * If provided, takes precedence over `section`.
   * Send `null` to explicitly clear.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  sectionId?: string | null;
}