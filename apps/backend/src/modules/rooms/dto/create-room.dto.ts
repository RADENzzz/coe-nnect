import {
  IsString,
  IsOptional,
  IsNumberString,
  IsIn,
  MaxLength,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRoomDto {
  @IsString()
  @MaxLength(50)
  roomNumber: string;

  @IsString()
  @MaxLength(100)
  building: string;

  @IsIn(['lecture_room', 'laboratory', 'computer_lab', 'drafting_room', 'other'])
  roomType: 'lecture_room' | 'laboratory' | 'computer_lab' | 'drafting_room' | 'other';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  capacity?: number;

  @IsOptional()
  @IsNumberString()
  deptId?: string;
}