import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsIn,
  IsNumberString,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(3)
  username: string;

  @IsString()
  @IsIn(['administrator', 'college_dean', 'department_head', 'viewer'])
  role: string;

  @IsOptional()
  @IsNumberString()
  deptId?: string;

  @IsOptional()
  @IsNumberString()
  facultyId?: string;
}