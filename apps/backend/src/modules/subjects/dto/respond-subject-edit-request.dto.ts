import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RespondSubjectEditRequestDto {
  @IsIn(['approve', 'reject', 'revoke'])
  action: 'approve' | 'reject' | 'revoke';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;
}
