import { IsIn } from 'class-validator';

export class UpdateStatusDto {
  @IsIn(['draft', 'review', 'finalized', 'published'])
  status: 'draft' | 'review' | 'finalized' | 'published';
}