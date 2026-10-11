import {
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PlotMultiSessionDto {
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'startTime must be in HH:MM or HH:MM:SS format',
  })
  startTime: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'endTime must be in HH:MM or HH:MM:SS format',
  })
  endTime: string;

  @IsString()
  @MinLength(1)
  dayOfWeek: string;
}

export class PlotMultiDto {
  @IsString()
  termId: string;

  @IsString()
  subjectId: string;

  @IsOptional()
  @IsString()
  facultyId?: string;

  @IsOptional()
  @IsString()
  roomId?: string;

  @IsOptional()
  @IsString()
  section?: string;

  @IsOptional()
  @IsString()
  loadType?: 'lecture' | 'laboratory' | 'other';

  /** One entry per day the class meets. */
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one session is required' })
  @ValidateNested({ each: true })
  @Type(() => PlotMultiSessionDto)
  sessions: PlotMultiSessionDto[];
}