import { BadRequestException } from '@nestjs/common';

export function createFakeSemesters(
  known = ['1st', '2nd', 'summer'],
  active = known,
) {
  return {
    assertUsable: jest.fn(async (code: string) => {
      if (!known.includes(code)) {
        throw new BadRequestException(`Unknown semester type "${code}".`);
      }
      if (!active.includes(code)) {
        throw new BadRequestException(`Semester type "${code}" is inactive.`);
      }
    }),
  };
}
