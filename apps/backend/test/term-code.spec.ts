import { TERM_CODE_PATTERN } from '../src/modules/idp/term-code';

describe('TERM_CODE_PATTERN', () => {
  it.each(['2026-2027-1st', '2026-2027-2nd', '2026-2027-summer', '2026-2027-3rd', '2026-2027-intersession'])(
    'accepts %s',
    (value) => expect(TERM_CODE_PATTERN.test(value)).toBe(true),
  );

  it.each(['2026-2027-Third Semester', '2026-3rd', '2026-2027-', '2026-2027-3RD!'])(
    'rejects %s',
    (value) => expect(TERM_CODE_PATTERN.test(value)).toBe(false),
  );
});
