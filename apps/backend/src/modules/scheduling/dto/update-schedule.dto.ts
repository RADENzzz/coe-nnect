import {
  IsOptional,
  IsString,
  IsIn,
  Matches,
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

  @IsOptional()
  @IsString()
  facultyId?: string;

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