import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateSectionDto {
  @IsString()
  @MaxLength(50)
  sectionCode: string;

  @IsOptional()
  @IsString()
  programId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  yearLevel?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  studentCount?: number;
}