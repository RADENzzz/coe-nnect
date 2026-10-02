import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator';

export class CreateDepartmentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  deptCode: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  deptName: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}