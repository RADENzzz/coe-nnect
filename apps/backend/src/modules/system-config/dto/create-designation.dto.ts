import { IsString, IsNumber, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDesignationDto {
  @IsString()
  @MaxLength(100)
  designationName: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  releaseHours: number;
}