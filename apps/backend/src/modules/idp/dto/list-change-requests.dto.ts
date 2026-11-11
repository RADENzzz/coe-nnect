import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const STATUSES = ['pending', 'acknowledged', 'rejected'] as const;
const TYPES = [
  'faculty_create',
  'faculty_update',
  'faculty_deactivate',
  'faculty_transfer',
  'qualification_add',
  'qualification_remove',
  'unavailability_change',
  'schedule_override',
] as const;

export class ListChangeRequestsDto {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @ApiPropertyOptional({ enum: TYPES })
  @IsOptional()
  @IsIn(TYPES)
  type?: (typeof TYPES)[number];

  @ApiPropertyOptional({ description: 'Maximum rows to return (1-500).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export { STATUSES as CHANGE_REQUEST_STATUSES, TYPES as CHANGE_REQUEST_TYPES };
