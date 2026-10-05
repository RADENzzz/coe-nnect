import {
  IsNumberString,
  IsInt,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProspectusDto {
  @IsNumberString()
  programId: string;

  @IsNumberString()
  subjectId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  yearLevel: number;

  @IsIn(['1st', '2nd', 'summer'])
  semester: '1st' | '2nd' | 'summer';
}