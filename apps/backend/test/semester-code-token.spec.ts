import { semesterCodeToken } from '../src/modules/prospectus-pdfs/semester-code-token';

describe('semesterCodeToken', () => {
  it.each([
    ['1st', '1'],
    ['2nd', '2'],
    ['summer', 'S'],
    ['3rd', '3'],
    ['intersession', 'I'],
    [null, 'X'],
    ['', 'X'],
  ])('maps %s to %s', (code, expected) => {
    expect(semesterCodeToken(code)).toBe(expected);
  });
});
