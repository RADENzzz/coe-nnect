import { BadRequestException } from '@nestjs/common';
import { SubjectsService } from '../src/modules/subjects/subjects.service';
import { createFakeRepository } from './fakes/repository.fake';

const admin = { role: 'administrator', deptId: null } as any;

const subjectRow = (overrides: Record<string, any> = {}) => ({
  subjectId: '1',
  subjectCode: 'MATH 100',
  title: 'College Algebra',
  totalUnits: 3,
  lectureUnits: 3,
  labUnits: 0,
  requiredRoomType: 'lecture_room',
  isMinor: false,
  isPlaceholder: false,
  isActive: true,
  deptId: '7',
  ...overrides,
});

const prospectusRow = (overrides: Record<string, any> = {}) => ({
  prospectusId: 'p1',
  programId: '10',
  subjectId: '1',
  yearLevel: 1,
  semester: '1st',
  isActive: true,
  deactivatedBySubject: false,
  lectureSessionsPerWeek: 1,
  lectureMinutesPerSession: 90,
  labSessionsPerWeek: 1,
  labMinutesPerSession: 180,
  ...overrides,
});

describe('SubjectsService.toggleActive prospectus cascade', () => {
  let service: SubjectsService;
  let subjectRepo: ReturnType<typeof createFakeRepository>;
  let prospectusRepo: ReturnType<typeof createFakeRepository>;

  const rowById = (id: string) =>
    prospectusRepo.rows.find((r: any) => r.prospectusId === id)!;

  beforeEach(() => {
    subjectRepo = createFakeRepository([subjectRow()], {
      idKey: 'subjectId',
    });
    prospectusRepo = createFakeRepository(
      [
        // Active mapping of the subject being deactivated.
        prospectusRow({ prospectusId: 'p1' }),
        // Manually deactivated mapping — must stay off.
        prospectusRow({
          prospectusId: 'p2',
          isActive: false,
          deactivatedBySubject: false,
        }),
        // Mapping of a different subject — must never be touched.
        prospectusRow({ prospectusId: 'p3', subjectId: '2' }),
      ],
      { idKey: 'prospectusId' },
    );

    const emptyRepo = createFakeRepository([]);
    const departments = {
      assertDepartmentActive: jest.fn().mockResolvedValue(undefined),
    };

    service = new SubjectsService(
      subjectRepo as any,
      emptyRepo as any,
      emptyRepo as any,
      prospectusRepo as any,
      departments as any,
    );
  });

  it('deactivates the subject and its active prospectus rows', async () => {
    const result = await service.toggleActive('1', admin);

    expect(result.isActive).toBe(false);
    expect(subjectRepo.rows[0].isActive).toBe(false);

    // Active row is switched off and marked as cascade-deactivated.
    expect(rowById('p1').isActive).toBe(false);
    expect(rowById('p1').deactivatedBySubject).toBe(true);

    // Manual choice is preserved.
    expect(rowById('p2').isActive).toBe(false);
    expect(rowById('p2').deactivatedBySubject).toBe(false);

    // Another subject is untouched.
    expect(rowById('p3').isActive).toBe(true);
  });

  it('restores only cascade-deactivated rows on reactivation', async () => {
    await service.toggleActive('1', admin); // deactivate
    const result = await service.toggleActive('1', admin); // reactivate

    expect(result.isActive).toBe(true);
    expect(subjectRepo.rows[0].isActive).toBe(true);

    expect(rowById('p1').isActive).toBe(true);
    expect(rowById('p1').deactivatedBySubject).toBe(false);

    // A row the user turned off by hand is not resurrected.
    expect(rowById('p2').isActive).toBe(false);

    // Another subject is still untouched.
    expect(rowById('p3').isActive).toBe(true);
  });
});

describe('SubjectsService elective units', () => {
  function createService(initialRows: Record<string, any>[] = []) {
    const subjectRepo = createFakeRepository(initialRows, {
      idKey: 'subjectId',
    });
    const emptyRepo = createFakeRepository([]);
    const departments = {
      assertDepartmentActive: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SubjectsService(
      subjectRepo as any,
      emptyRepo as any,
      emptyRepo as any,
      emptyRepo as any,
      departments as any,
    );
    return { service, subjectRepo };
  }

  const electiveDto = (overrides: Record<string, any> = {}) => ({
    subjectCode: 'GEC 101',
    title: 'Gender and Society',
    totalUnits: 3,
    lectureUnits: 3,
    labUnits: 0,
    isElective: true,
    unitsMode: 'lec_lab',
    deptId: '7',
    ...overrides,
  });

  it('creates a total-only elective with zero lecture and lab units', async () => {
    const { service, subjectRepo } = createService();

    const saved = await service.create(
      electiveDto({
        totalUnits: 3,
        lectureUnits: 0,
        labUnits: 0,
        unitsMode: 'total_only',
      }) as any,
      admin,
    );

    expect(saved).toMatchObject({
      subjectCode: 'GEC 101',
      isElective: true,
      unitsMode: 'total_only',
      totalUnits: 3,
      lectureUnits: 0,
      labUnits: 0,
    });
    expect(subjectRepo.rows).toHaveLength(1);
  });

  it('rejects total-only units for a regular subject', async () => {
    const { service } = createService();

    await expect(
      service.create(
        electiveDto({
          isElective: false,
          totalUnits: 3,
          lectureUnits: 0,
          labUnits: 0,
          unitsMode: 'total_only',
        }) as any,
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a total-only elective that still has a breakdown', async () => {
    const { service } = createService();

    await expect(
      service.create(
        electiveDto({
          totalUnits: 3,
          lectureUnits: 2,
          labUnits: 1,
          unitsMode: 'total_only',
        }) as any,
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('clears the placeholder flag when a temporary elective gets a real code', async () => {
    const { service, subjectRepo } = createService([
      subjectRow({
        subjectId: 'e1',
        subjectCode: 'ELEC-Y1S1-ABC123',
        title: 'Free Elective',
        totalUnits: 3,
        lectureUnits: 0,
        labUnits: 0,
        isElective: true,
        isPlaceholder: true,
        unitsMode: 'total_only',
      }),
    ]);

    await service.update('e1', { subjectCode: 'GEC 101' } as any, admin);

    expect(subjectRepo.rows[0].subjectCode).toBe('GEC 101');
    expect(subjectRepo.rows[0].isPlaceholder).toBe(false);
  });
});

describe('SubjectsService elective metadata', () => {
  function createService(initialRows: Record<string, any>[] = []) {
    const subjectRepo = createFakeRepository(initialRows, {
      idKey: 'subjectId',
    });
    const emptyRepo = createFakeRepository([]);
    const departments = {
      assertDepartmentActive: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SubjectsService(
      subjectRepo as any,
      emptyRepo as any,
      emptyRepo as any,
      emptyRepo as any,
      departments as any,
    );
    return { service, subjectRepo };
  }

  const electiveDto = (overrides: Record<string, any> = {}) => ({
    subjectCode: 'GEC 101',
    title: 'Gender and Society',
    totalUnits: 3,
    lectureUnits: 3,
    labUnits: 0,
    isElective: true,
    unitsMode: 'lec_lab',
    deptId: '7',
    ...overrides,
  });

  it('trims and persists category/year/semester for an elective', async () => {
    const { service, subjectRepo } = createService();

    const saved = await service.create(
      electiveDto({
        electiveCategory: '  GEC  ',
        electiveYearLevel: 2,
        electiveSemester: '2nd',
      }) as any,
      admin,
    );

    expect(saved).toMatchObject({
      isElective: true,
      electiveCategory: 'GEC',
      electiveYearLevel: 2,
      electiveSemester: '2nd',
    });
    expect(subjectRepo.rows[0]).toMatchObject({
      electiveCategory: 'GEC',
      electiveYearLevel: 2,
      electiveSemester: '2nd',
    });
  });

  it('ignores elective metadata on a non-elective subject', async () => {
    const { service, subjectRepo } = createService();

    await service.create(
      electiveDto({
        isElective: false,
        electiveCategory: 'GEC',
        electiveYearLevel: 3,
        electiveSemester: 'summer',
      }) as any,
      admin,
    );

    expect(subjectRepo.rows[0]).toMatchObject({
      isElective: false,
      electiveCategory: null,
      electiveYearLevel: null,
      electiveSemester: null,
    });
  });

  it('clears elective metadata when an elective becomes regular', async () => {
    const { service, subjectRepo } = createService([
      subjectRow({
        subjectId: 'e1',
        isElective: true,
        unitsMode: 'lec_lab',
        electiveCategory: 'GEC',
        electiveYearLevel: 2,
        electiveSemester: '1st',
      }),
    ]);

    await service.update('e1', { isElective: false } as any, admin);

    expect(subjectRepo.rows[0]).toMatchObject({
      isElective: false,
      electiveCategory: null,
      electiveYearLevel: null,
      electiveSemester: null,
    });
  });

  it('treats a blank elective category as uncategorized', async () => {
    const { service, subjectRepo } = createService([
      subjectRow({
        subjectId: 'e1',
        isElective: true,
        unitsMode: 'lec_lab',
        electiveCategory: 'GEC',
      }),
    ]);

    await service.update('e1', { electiveCategory: '   ' } as any, admin);

    expect(subjectRepo.rows[0].electiveCategory).toBeNull();
  });
});
