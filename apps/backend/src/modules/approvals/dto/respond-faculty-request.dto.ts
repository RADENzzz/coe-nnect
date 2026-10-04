import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RespondFacultyRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;
}