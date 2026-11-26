import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSchedulePublishRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Note must be at most 1000 characters.' })
  note?: string;
}
