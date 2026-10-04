import {
  IsOptional,
  IsIn,
  IsNumberString,
  IsString,
  MinLength,
  IsBoolean,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  username?: string;

  @IsOptional()
  @IsString()
  @IsIn(['administrator', 'college_dean', 'department_head', 'viewer'])
  role?: string;

  @IsOptional()
  @IsNumberString()
  deptId?: string;

  @IsOptional()
  @IsNumberString()
  facultyId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}