// apps/backend/src/modules/prospectus-pdfs/dto/extract.dto.ts

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
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

  @IsOptional()
  @IsBoolean()
  ocr?: boolean;
}

/** What the user decided to do with this row on import. */
export const IMPORT_ROW_ACTIONS = [
  'subject',
  'elective',
  'slot',
  'skip',
] as const;
export type ImportRowAction = (typeof IMPORT_ROW_ACTIONS)[number];

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

  /**
   * Existing elective subject chosen by the user. When set, the importer uses
   * that subject instead of creating a new one.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  subject_id?: number;

  /**
   * `lec_lab` (default) uses the lec/lab/total columns. `total_only` is valid
   * for elective rows whose source only lists a total.
   */
  @IsOptional()
  @IsIn(['lec_lab', 'total_only'])
  units_mode?: 'lec_lab' | 'total_only';

  /**
   * Per-row decision. Defaults to 'subject' so older clients keep working.
   *   'subject'  → treat `code` as a real subject code (the classic path).
   *   'elective' → elective subject; use `subject_id` when chosen, otherwise
   *                `code` when typed, otherwise a temporary flagged code.
   *   'slot'     → legacy elective placeholder ("GEC Elective 1").
   *                `code` is ignored; the PDF title becomes the slot label.
   *   'skip'     → don't import this row; report it back as skipped.
   */
  @IsOptional()
  @IsIn(IMPORT_ROW_ACTIONS)
  action?: ImportRowAction;
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