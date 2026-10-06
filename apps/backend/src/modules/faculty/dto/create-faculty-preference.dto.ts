import { IsIn, IsNotEmpty, Matches } from 'class-validator';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

export class CreateFacultyPreferenceDto {
  @IsNotEmpty()
  @IsIn(DAYS as unknown as string[])
  preferredDay!: string;

  /** "HH:MM" or "HH:MM:SS" — DB accepts either. */
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'preferredStartTime must be in HH:MM or HH:MM:SS format.',
  })
  preferredStartTime!: string;

  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'preferredEndTime must be in HH:MM or HH:MM:SS format.',
  })
  preferredEndTime!: string;
}