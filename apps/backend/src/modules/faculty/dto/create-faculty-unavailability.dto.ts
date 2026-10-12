import {
  IsIn,
  IsOptional,
  IsString,
  IsNumberString,
  Matches,
  MaxLength,
} from 'class-validator';

const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export class CreateFacultyUnavailabilityDto {
  @IsIn(DAYS)
  dayOfWeek!: string;

  /** HH:MM — matches the DB `time` type's accepted prefix. */
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'startTime must be HH:MM (24-hour)',
  })
  startTime!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'endTime must be HH:MM (24-hour)',
  })
  endTime!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  /** Optional term scope; NULL = applies to all terms. */
  @IsOptional()
  @IsNumberString()
  termId?: string;
}