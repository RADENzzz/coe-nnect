import { IsOptional, IsString, MaxLength, IsInt, Min } from 'class-validator';

export class UpdatePdfDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  original_filename?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  department_id?: number;

  /**
   * Repair metadata written when the parser was unreachable at upload time.
   * The editor reads the true count from the PDF itself and reports it here.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  page_count?: number;
}
