import {
  IsOptional,
  IsIn,
  IsNumberString,
  IsString,
  MinLength,
  IsBoolean,
} from 'class-validator';
import { ASSIGNABLE_ROLES, AssignableRole } from './create-user.dto';

/**
 * Same assignable-role restriction as CreateUserDto.
 * Updating a user can only move them between Dean and DH.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  username?: string;

  @IsOptional()
  @IsIn(ASSIGNABLE_ROLES)
  role?: AssignableRole;

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