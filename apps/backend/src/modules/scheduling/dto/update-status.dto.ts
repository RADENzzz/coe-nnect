import { IsIn } from 'class-validator';

/**
 * Publishing is a Dean decision made through the publish-request flow.
 * The status endpoint can only move entries between editable states.
 */
export class UpdateStatusDto {
  @IsIn(['draft', 'review', 'finalized'])
  status: 'draft' | 'review' | 'finalized';
}
