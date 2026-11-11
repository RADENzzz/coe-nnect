import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Contract 4.8 — the decision recorded by a CoE-NNECT reviewer. */
export class AckChangeRequestDto {
  @ApiProperty({
    enum: ['accepted', 'rejected', 'modified'],
    description: 'Reviewer decision for the change request.',
  })
  @IsIn(['accepted', 'rejected', 'modified'])
  action!: 'accepted' | 'rejected' | 'modified';

  @ApiPropertyOptional({
    description: 'Optional reviewer note echoed to IDP in the ack.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
