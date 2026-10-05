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

  // NOTE: `studentCount` intentionally removed.
  // The PM flagged that defining the number of students per section
  // does not guarantee they all take the same subjects. The DB column
  // is kept for backward compatibility but is no longer settable
  // through the API.
}