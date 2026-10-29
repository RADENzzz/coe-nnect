import {
  IsBoolean,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateProgramDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  programCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  programName?: string;

  @IsOptional()
  @IsNumberString()
  deptId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
