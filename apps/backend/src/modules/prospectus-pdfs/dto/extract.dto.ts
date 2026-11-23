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
  Max,
  MaxLength,
  Min,
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
   * User-defined elective group (for example "GEC" or "Major"). Stored on a
   * newly created elective subject so filters and dropdowns can group it.
   */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  elective_category?: string;

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

  /**
   * Classification chosen during import review. Only meaningful for regular
   * subject rows; minor subjects are taught by another department and are
   * plotted manually before auto-generation.
   */
  @IsOptional()
  @IsBoolean()
  is_minor?: boolean;

  /**
   * How many empty elective fields this row represents. An empty row in a
   * regular prospectus table is a slot, not a catalog subject; a department
   * that offers two electives in that slot imports two copies. Ignored when
   * the row references an existing/typed elective.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  copies?: number;
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