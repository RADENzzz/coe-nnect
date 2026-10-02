import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRemarksDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;
}