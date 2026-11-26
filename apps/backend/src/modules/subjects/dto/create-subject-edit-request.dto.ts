import { IsString, Matches, MaxLength } from 'class-validator';

export class CreateSubjectEditRequestDto {
  @IsString()
  @Matches(/\S/, { message: 'A reason is required' })
  @MaxLength(1000)
  reason: string;
}
