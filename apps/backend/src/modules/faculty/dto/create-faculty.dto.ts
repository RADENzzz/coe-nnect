import {
  IsString,
  IsOptional,
  IsEmail,
  IsNumberString,
  IsIn,
  MaxLength,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFacultyDto {
  @IsString()
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MaxLength(100)
  lastName: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  wmsuId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeId?: string;

  @IsOptional()
  @IsNumberString()
  deptId?: string;

  @IsOptional()
  @IsNumberString()
  designationId?: string;

  @IsIn(['regular', 'part_time', 'visiting_lecturer', 'other'])
  classification: 'regular' | 'part_time' | 'visiting_lecturer' | 'other';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  requiredHours?: number;
}