import { IsNumberString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRoomPreferenceDto {
  @IsNumberString()
  roomId: string;

  @IsNumberString()
  deptId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  priority?: number;
}

export class UpdateRoomPreferenceDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  priority: number;
}