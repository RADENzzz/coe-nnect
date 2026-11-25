import { IsString, Matches } from 'class-validator';
import { TERM_CODE_PATTERN } from '../term-code';

/** `YYYY-YYYY-<semester code>`, e.g. `2026-2027-1st`. Contract 2.4. */

export class PublishScheduleDto {
  @IsString()
  @Matches(TERM_CODE_PATTERN, {
    message: 'termCode must look like 2026-2027-1st',
  })
  termCode!: string;
}
