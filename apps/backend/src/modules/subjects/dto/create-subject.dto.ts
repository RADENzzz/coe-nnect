import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  MaxLength,
  IsNumberString,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSubjectDto {
  @IsString()
  @MaxLength(50)
  subjectCode: string;

  @IsString()
  @MaxLength(200)
  title: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalUnits: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  lectureUnits: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  labUnits: number;

  @IsOptional()
  @IsIn(['lecture_room', 'laboratory', 'computer_lab', 'drafting_room', 'other'])
  requiredRoomType?: string | null;

  @IsNumberString()
  deptId: string;
}