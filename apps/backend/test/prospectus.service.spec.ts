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
    totalUnits: 3,
    lectureUnits: 3,
    labUnits: 0,
    unitsMode: 'lec_lab',
    electiveYearLevel: 2,
    electiveSemester: '2nd',
    isActive: true,
    isPlaceholder: true,
    isElective: false,
    deptId: '7',
  };

  const elective = {
    subjectId: 'elective-1',
    subjectCode: 'GEC 101',
    title: 'Gender and Society',
    totalUnits: 3,
    lectureUnits: 3,
    labUnits: 0,
    unitsMode: 'lec_lab',
    electiveYearLevel: 1,
    electiveSemester: '1st',
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
      { idKey: 'prospectusId', autoId: true },
    );
    const programRepo = createFakeRepository([programRow()], {
      idKey: 'programId',
    });
    const subjectRepo = createFakeRepository(
      [{ ...placeholder }, { ...elective }, { ...regular }],
      { idKey: 'subjectId', autoId: true },
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

  it('creates and saves a real elective when a new code is typed', async () => {
    const { service, prospectusRepo, subjectRepo } = createService();

    const result = await service.fillSlot(
      'p1',
      { newSubjectCode: 'GEC 200' },
      admin,
    );

    const created = subjectRepo.rows.find(
      (row) => row.subjectCode === 'GEC 200',
    );
    expect(created).toMatchObject({
      title: 'Elective Slot',
      totalUnits: 3,
      lectureUnits: 3,
      labUnits: 0,
      isActive: true,
      isPlaceholder: false,
      isElective: true,
      deptId: '7',
      electiveYearLevel: 2,
      electiveSemester: '2nd',
    });
    expect(result.subjectId).toBe(created?.subjectId);
    expect(prospectusRepo.rows[0].subjectId).toBe(created?.subjectId);
    expect(
      subjectRepo.rows.find((row) => row.subjectId === 'slot-1')?.isActive,
    ).toBe(false);
  });

  it('reuses an existing elective when its code is typed', async () => {
    const { service, prospectusRepo, subjectRepo } = createService();
    const before = subjectRepo.rows.length;

    const result = await service.fillSlot(
      'p1',
      { newSubjectCode: 'GEC 101' },
      admin,
    );

    expect(result.subjectId).toBe('elective-1');
    expect(prospectusRepo.rows[0].subjectId).toBe('elective-1');
    expect(subjectRepo.rows).toHaveLength(before);
  });

  it('rejects a typed temporary placeholder code', async () => {
    const { service, prospectusRepo } = createService();

    await expect(
      service.fillSlot('p1', { newSubjectCode: 'ELEC-Y1S1-AB12CD' }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prospectusRepo.rows[0].subjectId).toBe('slot-1');
  });

  it('rejects choosing a subject and typing a code at once', async () => {
    const { service, prospectusRepo } = createService();

    await expect(
      service.fillSlot(
        'p1',
        { subjectId: 'elective-1', newSubjectCode: 'GEC 200' },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prospectusRepo.rows[0].subjectId).toBe('slot-1');
  });

  it('duplicates an empty field with a distinct placeholder subject', async () => {
    const { service, prospectusRepo, subjectRepo } = createService();

    const copy = await service.duplicateSlot('p1', admin);
    const second = await service.duplicateSlot('p1', admin);

    expect(copy.prospectusId).not.toBe('p1');
    expect(second.prospectusId).not.toBe(copy.prospectusId);

    const copySubject = subjectRepo.rows.find(
      (row) => row.subjectId === copy.subjectId,
    );
    expect(copySubject).toMatchObject({
      subjectCode: 'SLOT-1-C2',
      title: 'Elective Slot',
      isActive: true,
      isPlaceholder: true,
      isElective: true,
    });
    expect(
      subjectRepo.rows.find((row) => row.subjectId === second.subjectId),
    ).toMatchObject({ subjectCode: 'SLOT-1-C3', isPlaceholder: true });
    expect(prospectusRepo.rows).toHaveLength(3);
  });

  it('refuses to duplicate a field that is not an empty placeholder', async () => {
    const { service, prospectusRepo } = createService();
    prospectusRepo.rows[0].subjectId = 'elective-1';
    prospectusRepo.rows[0].subject = { ...elective };

    await expect(service.duplicateSlot('p1', admin)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prospectusRepo.rows).toHaveLength(1);
  });

  it('deletes the placeholder subject when its last field is removed', async () => {
    const { service, subjectRepo } = createService();

    await service.remove('p1', admin);

    expect(
      subjectRepo.rows.some((row) => row.subjectId === 'slot-1'),
    ).toBe(false);
  });

  it('keeps a placeholder that still backs another field', async () => {
    const { service, prospectusRepo, subjectRepo } = createService();
    prospectusRepo.rows.push({
      ...prospectusRow({
        prospectusId: 'p2',
        subjectId: 'slot-1',
        isActive: true,
        deactivatedBySubject: false,
      }),
      slotLabel: 'Elective Slot',
      subject: { ...placeholder },
      program: { ...programRow() },
    });

    await service.remove('p1', admin);

    expect(
      subjectRepo.rows.some((row) => row.subjectId === 'slot-1'),
    ).toBe(true);
  });
});
