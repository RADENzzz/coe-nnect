import { IsString, MinLength, MaxLength } from 'class-validator';

export class FlagScheduleDto {
  @IsString()
  @MinLength(3, { message: 'Reason must be at least 3 characters.' })
  @MaxLength(500, { message: 'Reason must be at most 500 characters.' })
  reason: string;
}