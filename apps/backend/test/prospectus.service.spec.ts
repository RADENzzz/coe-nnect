import { BadRequestException } from '@nestjs/common';
import { ProspectusService } from '../src/modules/prospectus/prospectus.service';
import { createFakeRepository } from './fakes/repository.fake';

const admin = { role: 'administrator', deptId: null } as any;

const programRow = (overrides: Record<string, any> = {}) => ({
  programId: '10',
  programCode: 'BSCE',
  programName: 'BS Civil Engineering',
  deptId: '7',
  isActive: true,
  ...overrides,
});

const subjectRow = (overrides: Record<string, any> = {}) => ({
  subjectId: '1',
  subjectCode: 'MATH 100',
  title: 'College Algebra',
  deptId: '7',
  isActive: true,
  isPlaceholder: false,
  ...overrides,
});

const prospectusRow = (overrides: Record<string, any> = {}) => ({
  prospectusId: 'p1',
  programId: '10',
  subjectId: '1',
  yearLevel: 1,
  semester: '1st',
  isActive: false,
  deactivatedBySubject: true,
  lectureSessionsPerWeek: 1,
  lectureMinutesPerSession: 90,
  labSessionsPerWeek: 1,
  labMinutesPerSession: 180,
  ...overrides,
});

describe('ProspectusService subject-active guard', () => {
  let service: ProspectusService;
  let prospectusRepo: ReturnType<typeof createFakeRepository>;

  const build = (subjectActive: boolean) => {
    prospectusRepo = createFakeRepository([prospectusRow()], {
      idKey: 'prospectusId',
    });
    const programRepo = createFakeRepository([programRow()], {
      idKey: 'programId',
    });
    const subjectRepo = createFakeRepository(
      [subjectRow({ isActive: subjectActive })],
      { idKey: 'subjectId' },
    );

    service = new ProspectusService(
      prospectusRepo as any,
      programRepo as any,
      subjectRepo as any,
    );
  };

  it('refuses to activate a mapping whose subject is inactive', async () => {
    build(false);

    await expect(service.toggleActive('p1', admin)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prospectusRepo.rows[0].isActive).toBe(false);
  });

  it('activates a mapping when its subject is active', async () => {
    build(true);

    const result = await service.toggleActive('p1', admin);

    expect(result.isActive).toBe(true);
    expect(prospectusRepo.rows[0].isActive).toBe(true);
    expect(prospectusRepo.rows[0].deactivatedBySubject).toBe(false);
  });

  it('refuses update(isActive: true) while the subject is inactive', async () => {
    build(false);

    await expect(
      service.update('p1', { isActive: true } as any, admin),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prospectusRepo.rows[0].isActive).toBe(false);
  });
});
