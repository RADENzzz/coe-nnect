import { IsString, Matches } from 'class-validator';

/** `YYYY-YYYY-1st|2nd|summer`, e.g. `2026-2027-1st`. Contract 2.4. */
const TERM_CODE = /^\d{4}-\d{4}-(1st|2nd|summer)$/;

export class PublishScheduleDto {
  @IsString()
  @Matches(TERM_CODE, {
    message: 'termCode must look like 2026-2027-1st',
  })
  termCode!: string;
}
