import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RespondScheduleChangeRequestDto {
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Remarks must be at most 500 characters.' })
  remarks?: string;
}
