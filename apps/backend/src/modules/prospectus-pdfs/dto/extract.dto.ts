import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ExtractRequestDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @Type(() => Number)
  @IsInt({ each: true })
  table_ids?: number[];
}

export class ImportSubjectDto {
  @IsString()
  @MaxLength(64)
  code!: string;

  @IsString()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  prereq?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  lec?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  lab?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  total?: string;
}

export class ImportRegionDto {
  @Type(() => Number)
  @IsInt()
  table_id!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportSubjectDto)
  subjects!: ImportSubjectDto[];
}

export class ImportConfirmDto {
  @Type(() => Number)
  @IsInt()
  program_id!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @Type(() => Number)
  @IsInt({ each: true })
  table_ids!: number[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ImportRegionDto)
  regions!: ImportRegionDto[];
}