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

describe('ProspectusService fillSlot elective guard', () => {
  const placeholder = {
    subjectId: 'slot-1',
    subjectCode: 'SLOT-1',
    title: 'Elective Slot',
    isActive: true,
    isPlaceholder: true,
    isElective: false,
    deptId: '7',
  };

  const elective = {
    subjectId: 'elective-1',
    subjectCode: 'GEC 101',
    title: 'Gender and Society',
    isActive: true,
    isPlaceholder: false,
    isElective: true,
    deptId: '7',
  };

  const regular = {
    subjectId: 'regular-1',
    subjectCode: 'MATH 100',
    title: 'College Algebra',
    isActive: true,
    isPlaceholder: false,
    isElective: false,
    deptId: '7',
  };

  function createService() {
    const prospectusRepo = createFakeRepository(
      [
        {
          ...prospectusRow({
            prospectusId: 'p1',
            subjectId: 'slot-1',
            isActive: true,
            deactivatedBySubject: false,
          }),
          slotLabel: null,
          subject: { ...placeholder },
          program: { ...programRow() },
        },
      ],
      { idKey: 'prospectusId' },
    );
    const programRepo = createFakeRepository([programRow()], {
      idKey: 'programId',
    });
    const subjectRepo = createFakeRepository(
      [{ ...placeholder }, { ...elective }, { ...regular }],
      { idKey: 'subjectId' },
    );

    const service = new ProspectusService(
      prospectusRepo as any,
      programRepo as any,
      subjectRepo as any,
    );

    return { service, prospectusRepo, subjectRepo };
  }

  it('rejects a regular subject as the fill target', async () => {
    const { service, prospectusRepo } = createService();

    await expect(
      service.fillSlot('p1', 'regular-1', admin),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prospectusRepo.rows[0].subjectId).toBe('slot-1');
  });

  it('fills a placeholder slot with an elective and retires the slot', async () => {
    const { service, prospectusRepo, subjectRepo } = createService();

    const result = await service.fillSlot('p1', 'elective-1', admin);

    expect(result.subjectId).toBe('elective-1');
    expect(prospectusRepo.rows[0].subjectId).toBe('elective-1');
    expect(prospectusRepo.rows[0].slotLabel).toBe('Elective Slot');
    expect(
      subjectRepo.rows.find((row) => row.subjectId === 'slot-1')?.isActive,
    ).toBe(false);
  });
});
