import {
  IsBoolean,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateProgramDto {
  @IsString()
  @MaxLength(30)
  programCode: string;

  @IsString()
  @MaxLength(200)
  programName: string;

  @IsNumberString()
  deptId: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
