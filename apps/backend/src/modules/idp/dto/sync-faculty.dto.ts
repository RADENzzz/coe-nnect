import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';
import { TERM_CODE_PATTERN } from '../term-code';

/**
 * Options for `POST /api/v1/idp/faculty/sync` ("Refresh from IDP").
 *
 * `departmentCode` is forced to the caller's own department when the caller
 * is a department head.
 */
export class SyncFacultyDto {
  @ApiPropertyOptional({
    description: 'Limit the pull to one department code (CPE, EE, GE, ENVE).',
    example: 'CPE',
  })
  @IsOptional()
  @IsString()
  departmentCode?: string;

  @ApiPropertyOptional({
    description:
      'Term code used for the unavailability pull (school_year-semester).',
    example: '2026-2027-1st',
  })
  @IsOptional()
  @IsString()
  @Matches(TERM_CODE_PATTERN, {
    message: 'termCode must look like 2026-2027-1st.',
  })
  termCode?: string;

  @ApiPropertyOptional({
    description: 'Pull qualification rows alongside the roster. Default true.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  includeQualifications?: boolean;

  @ApiPropertyOptional({
    description:
      'Pull unavailability rows for `termCode`. Default true when termCode is set.',
  })
  @IsOptional()
  @IsBoolean()
  includeUnavailability?: boolean;
}
