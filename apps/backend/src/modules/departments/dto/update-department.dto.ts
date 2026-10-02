import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator';

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  deptCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  deptName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}