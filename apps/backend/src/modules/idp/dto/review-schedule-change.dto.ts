import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** A department-head decision on a faculty/IDP schedule change. */
export class ReviewScheduleChangeDto {
  @ApiProperty({
    enum: ['accepted', 'rejected'],
    description: 'Approve or reject the proposed schedule change.',
  })
  @IsIn(['accepted', 'rejected'])
  action!: 'accepted' | 'rejected';

  @ApiPropertyOptional({
    description: 'Optional reviewer note stored with the decision.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiPropertyOptional({
    description:
      'Set after the reviewer has read and accepted the blocking conflicts.',
  })
  @IsOptional()
  @IsBoolean()
  acknowledgeConflicts?: boolean;
}
