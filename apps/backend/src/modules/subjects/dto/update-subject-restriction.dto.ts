import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSubjectRestrictionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  warningMessage?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}