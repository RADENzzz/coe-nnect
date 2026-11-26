import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateScheduleChangeRequestDto {
  @IsString()
  @MinLength(5, {
    message: 'Tell the Dean what needs to change (at least 5 characters).',
  })
  @MaxLength(500, { message: 'Reason must be at most 500 characters.' })
  reason: string;
}
