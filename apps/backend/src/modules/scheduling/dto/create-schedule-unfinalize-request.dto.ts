import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateScheduleUnfinalizeRequestDto {
  @IsString()
  @MinLength(5, {
    message:
      'Tell the Dean why this published entry needs to be unfinalized (at least 5 characters).',
  })
  @MaxLength(500, { message: 'Reason must be at most 500 characters.' })
  reason: string;
}
