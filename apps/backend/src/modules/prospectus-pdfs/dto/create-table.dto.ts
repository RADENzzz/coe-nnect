import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const COLUMN_ROLES = [
  'code',
  'title',
  'prereq',
  'lec',
  'lab',
  'total',
] as const;

export class ColumnSliceDto {
  @IsIn(COLUMN_ROLES)
  role!: (typeof COLUMN_ROLES)[number];

  @IsNumber()
  @Min(0)
  x_start_pt!: number;

  @IsNumber()
  @Min(0)
  x_end_pt!: number;
}

export class RowDto {
  @IsString()
  @MaxLength(64)
  row_id!: string;

  @IsNumber()
  @Min(0)
  y_top_pt!: number;

  @IsNumber()
  @Min(0)
  y_bottom_pt!: number;

  /**
   * Optional per-cell text overrides (column role → text). Lets the editor
   * keep a duplicated/edited row's content independent of PDF geometry.
   */
  @IsOptional()
  @IsObject()
  cells?: Record<string, string>;

  /** Explicitly blank row; the extractor must not read the PDF below it. */
  @IsOptional()
  @IsBoolean()
  blank?: boolean;

  /** Roles that were empty when the row's PDF geometry was pinned. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsIn(COLUMN_ROLES, { each: true })
  pinned_empty?: (typeof COLUMN_ROLES)[number][];
}

export class CreateTableDto {
  @IsInt()
  @Min(1)
  @Max(6)
  year_level!: number;

  @IsIn(['1st', '2nd', 'summer'])
  semester!: '1st' | '2nd' | 'summer';

  /**
   * `regular` (default) is the curriculum table for a year/semester.
   * `elective` marks an elective table; multiple elective tables may share the
   * same year/semester in one PDF.
   */
  @IsOptional()
  @IsIn(['regular', 'elective'])
  table_kind?: 'regular' | 'elective';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsInt()
  @Min(0)
  region_page_index!: number;

  @IsNumber()
  @Min(0)
  region_x_start_pt!: number;

  @IsNumber()
  @Min(0)
  region_x_end_pt!: number;

  @IsNumber()
  @Min(0)
  region_y_start_pt!: number;

  @IsNumber()
  @Min(0)
  region_y_end_pt!: number;

  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => ColumnSliceDto)
  columns!: ColumnSliceDto[];

  // Rows are allowed to be empty during table creation — the user
  // draws rows AFTER the region is created.
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RowDto)
  rows!: RowDto[];
}