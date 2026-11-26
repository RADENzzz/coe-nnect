import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SubjectsService } from '../src/modules/subjects/subjects.service';
import { createFakeRepository } from './fakes/repository.fake';
import { createFakeSemesters } from './fakes/semesters.fake';

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

const createEditRequestsStub = () => ({
  hasActiveGrant: jest.fn().mockResolvedValue(false),
  revokeGrantsForOwner: jest.fn().mockResolvedValue(undefined),
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
      emptyRepo as any,
      departments as any,
      createFakeSemesters() as any,
      createEditRequestsStub() as any,
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
      emptyRepo as any,
      departments as any,
      createFakeSemesters() as any,
      createEditRequestsStub() as any,
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

describe('SubjectsService.remove', () => {
  function createService(
    options: {
      prospectusRows?: Record<string, any>[];
      scheduleRows?: Record<string, any>[];
      qualificationRows?: Record<string, any>[];
      restrictionCount?: number;
    } = {},
  ) {
    const subjectRepo = createFakeRepository([subjectRow()], {
      idKey: 'subjectId',
    });
    const prospectusRepo = createFakeRepository(
      options.prospectusRows ?? [],
      { idKey: 'prospectusId' },
    );
    const scheduleRepo = createFakeRepository(options.scheduleRows ?? [], {
      idKey: 'scheduleId',
    });
    const qualificationRepo = createFakeRepository(
      options.qualificationRows ?? [],
      { idKey: 'qualId' },
    );
    const restrictions = createFakeRepository([]);
    restrictions.createQueryBuilder = jest.fn(() => {
      const builder: any = {
        where: jest.fn(() => builder),
        getCount: jest.fn(async () => options.restrictionCount ?? 0),
      };
      return builder;
    });
    const departments = {
      assertDepartmentActive: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SubjectsService(
      subjectRepo as any,
      restrictions as any,
      scheduleRepo as any,
      prospectusRepo as any,
      qualificationRepo as any,
      departments as any,
      createFakeSemesters() as any,
      createEditRequestsStub() as any,
    );
    return {
      service,
      subjectRepo,
      prospectusRepo,
      scheduleRepo,
      qualificationRepo,
    };
  }

  it('deletes a subject with prospectus mappings', async () => {
    const { service, subjectRepo, prospectusRepo } = createService({
      prospectusRows: [prospectusRow()],
    });

    // The database FK is ON DELETE CASCADE; mirror that here so the test
    // asserts the end state the service relies on.
    subjectRepo.remove.mockImplementation(async (entity: any) => {
      await prospectusRepo.delete({ subjectId: entity.subjectId });
      const index = subjectRepo.rows.indexOf(entity);
      if (index >= 0) subjectRepo.rows.splice(index, 1);
      return entity;
    });

    await expect(service.remove('1', admin)).resolves.toEqual({
      success: true,
    });
    expect(subjectRepo.rows).toHaveLength(0);
    expect(prospectusRepo.rows).toHaveLength(0);
  });

  it('removes unpublished schedule rows with the subject', async () => {
    const { service, subjectRepo, scheduleRepo } = createService({
      scheduleRows: [
        { scheduleId: 's1', subjectId: '1', status: 'draft' },
        { scheduleId: 's2', subjectId: '1', status: 'review' },
        { scheduleId: 's3', subjectId: '1', status: 'finalized' },
      ],
    });

    await expect(service.remove('1', admin)).resolves.toEqual({
      success: true,
    });
    expect(subjectRepo.rows).toHaveLength(0);
    expect(scheduleRepo.rows).toHaveLength(0);
  });

  it('keeps schedule rows belonging to other subjects', async () => {
    const { service, scheduleRepo } = createService({
      scheduleRows: [
        { scheduleId: 's1', subjectId: '1', status: 'draft' },
        { scheduleId: 's2', subjectId: '2', status: 'published' },
        { scheduleId: 's3', subjectId: '2', status: 'draft' },
      ],
    });

    await expect(service.remove('1', admin)).resolves.toEqual({
      success: true,
    });
    expect(scheduleRepo.rows.map((row) => row.scheduleId)).toEqual([
      's2',
      's3',
    ]);
  });

  it('removes faculty qualifications for the deleted subject', async () => {
    const { service, qualificationRepo } = createService({
      qualificationRows: [
        { qualId: 'q1', facultyId: 'f1', subjectId: '1' },
        { qualId: 'q2', facultyId: 'f2', subjectId: '1' },
        { qualId: 'q3', facultyId: 'f1', subjectId: '2' },
      ],
    });

    await expect(service.remove('1', admin)).resolves.toEqual({
      success: true,
    });
    expect(qualificationRepo.rows.map((row) => row.qualId)).toEqual(['q3']);
  });

  it('blocks a subject with published schedule history and keeps every row', async () => {
    const { service, subjectRepo, scheduleRepo } = createService({
      scheduleRows: [
        { scheduleId: 's1', subjectId: '1', status: 'published' },
        { scheduleId: 's2', subjectId: '1', status: 'draft' },
      ],
    });

    await expect(service.remove('1', admin)).rejects.toThrow(
      /published schedule entry/,
    );
    expect(subjectRepo.rows).toHaveLength(1);
    expect(scheduleRepo.rows).toHaveLength(2);
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
      emptyRepo as any,
      departments as any,
      createFakeSemesters() as any,
      createEditRequestsStub() as any,
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

describe('SubjectsService semester validation', () => {
  function createService(semesters = createFakeSemesters()) {
    const subjectRepo = createFakeRepository(
      [
        subjectRow({
          subjectId: '1',
          isElective: true,
          electiveSemester: 'summer',
        }),
      ],
      { idKey: 'subjectId' },
    );
    const emptyRepo = createFakeRepository([]);
    const departments = {
      assertDepartmentActive: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SubjectsService(
      subjectRepo as any,
      emptyRepo as any,
      emptyRepo as any,
      emptyRepo as any,
      emptyRepo as any,
      departments as any,
      semesters as any,
      createEditRequestsStub() as any,
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

  it('rejects an unknown elective semester', async () => {
    const { service } = createService();

    await expect(
      service.create(electiveDto({ electiveSemester: '3rd' }) as any, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not revalidate an inactive semester when the update leaves it unchanged', async () => {
    const semesters = createFakeSemesters(
      ['1st', '2nd', 'summer'],
      ['1st', '2nd'],
    );
    const { service } = createService(semesters);

    await service.update('1', { title: 'Renamed' } as any, admin);

    expect(semesters.assertUsable).not.toHaveBeenCalled();
  });
});

describe('SubjectsService shared edit access', () => {
  const ownerHead = {
    userId: 'u-owner',
    role: 'department_head',
    deptId: '7',
  } as any;
  const requesterHead = {
    userId: 'u-requester',
    role: 'department_head',
    deptId: '9',
  } as any;
  const dean = { userId: 'u-dean', role: 'college_dean', deptId: null } as any;
  const secretary = {
    userId: 'u-secretary',
    role: 'college_secretary',
    deptId: null,
  } as any;
  const secretaryWithDept = {
    userId: 'u-secretary',
    role: 'college_secretary',
    deptId: '8',
  } as any;

  const needRequest =
    'Request edit access from the owning department before modifying this subject.';

  function createHarness(
    options: { subject?: Record<string, any>; grant?: boolean } = {},
  ) {
    const subjectRepo = createFakeRepository(
      [subjectRow(options.subject ?? {})],
      { idKey: 'subjectId' },
    );
    const emptyRepo = createFakeRepository([]);
    const restrictions = createFakeRepository([]);
    restrictions.createQueryBuilder = jest.fn(() => {
      const builder: any = {
        where: jest.fn(() => builder),
        getCount: jest.fn(async () => 0),
      };
      return builder;
    });
    const departments = {
      assertDepartmentActive: jest.fn().mockResolvedValue(undefined),
    };
    const editRequests = {
      hasActiveGrant: jest.fn().mockResolvedValue(options.grant ?? false),
      revokeGrantsForOwner: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SubjectsService(
      subjectRepo as any,
      restrictions as any,
      emptyRepo as any,
      emptyRepo as any,
      emptyRepo as any,
      departments as any,
      createFakeSemesters() as any,
      editRequests as any,
    );
    return { service, subjectRepo, departments, editRequests };
  }

  it('allows the owning head and college-wide roles to update', async () => {
    for (const profile of [ownerHead, admin, dean, secretary]) {
      const { service, subjectRepo, editRequests } = createHarness();

      await expect(
        service.update('1', { title: 'Allowed edit' } as any, profile),
      ).resolves.toMatchObject({ title: 'Allowed edit' });

      expect(subjectRepo.rows[0].title).toBe('Allowed edit');
      expect(editRequests.hasActiveGrant).not.toHaveBeenCalled();
    }
  });

  it('allows another head to update a MINOR subject without changing its deptId', async () => {
    const { service, subjectRepo, editRequests } = createHarness({
      subject: { isMinor: true },
    });

    await expect(
      service.update('1', { title: 'Shared edit' } as any, requesterHead),
    ).resolves.toMatchObject({ title: 'Shared edit' });

    expect(subjectRepo.rows[0]).toMatchObject({
      title: 'Shared edit',
      isMinor: true,
      deptId: '7',
    });
    expect(editRequests.hasActiveGrant).not.toHaveBeenCalled();
  });

  it('allows another head to update only when hasActiveGrant resolves true', async () => {
    const { service, editRequests } = createHarness({ grant: true });

    await expect(
      service.update('1', { title: 'Granted edit' } as any, requesterHead),
    ).resolves.toMatchObject({ title: 'Granted edit' });

    expect(editRequests.hasActiveGrant).toHaveBeenCalledWith('1', '9');
  });

  it('rejects another head on a non-MINOR subject with no grant before repo.save', async () => {
    const { service, subjectRepo, editRequests } = createHarness();

    await expect(
      service.update('1', { title: 'Denied edit' } as any, requesterHead),
    ).rejects.toThrow(new ForbiddenException(needRequest));

    expect(editRequests.hasActiveGrant).toHaveBeenCalledWith('1', '9');
    expect(subjectRepo.save).not.toHaveBeenCalled();
  });

  it('transfers ownership to the acting dept on unlabel and revokes the old owner grants', async () => {
    const { service, subjectRepo, departments, editRequests } = createHarness({
      subject: { isMinor: true },
    });

    const saved = await service.update(
      '1',
      { isMinor: false, deptId: '9' } as any,
      requesterHead,
    );

    expect(saved).toMatchObject({ isMinor: false, deptId: '9' });
    expect(subjectRepo.rows[0]).toMatchObject({ isMinor: false, deptId: '9' });
    expect(departments.assertDepartmentActive).toHaveBeenCalledWith('9');
    expect(editRequests.revokeGrantsForOwner).toHaveBeenCalledWith('1', '7');
    expect(subjectRepo.save).toHaveBeenCalledTimes(1);
  });

  it('keeps the current owner when the actor has no dept on unlabel', async () => {
    const { service, subjectRepo, editRequests } = createHarness({
      subject: { isMinor: true },
    });

    await service.update('1', { isMinor: false } as any, secretary);

    expect(subjectRepo.rows[0]).toMatchObject({ isMinor: false, deptId: '7' });
    expect(editRequests.revokeGrantsForOwner).not.toHaveBeenCalled();
  });

  it('transfers ownership to a college-wide actor department on unlabel', async () => {
    const { service, subjectRepo, editRequests } = createHarness({
      subject: { isMinor: true },
    });

    await service.update('1', { isMinor: false } as any, secretaryWithDept);

    expect(subjectRepo.rows[0]).toMatchObject({ isMinor: false, deptId: '8' });
    expect(editRequests.revokeGrantsForOwner).toHaveBeenCalledWith('1', '7');
  });

  it('revokes grants whenever a college-wide role changes deptId', async () => {
    const { service, subjectRepo, editRequests } = createHarness();

    await service.update('1', { deptId: '8' } as any, admin);

    expect(subjectRepo.rows[0].deptId).toBe('8');
    expect(editRequests.revokeGrantsForOwner).toHaveBeenCalledWith('1', '7');
  });

  it('still blocks a department head from moving a non-MINOR subject', async () => {
    const { service, subjectRepo, editRequests } = createHarness();

    await expect(
      service.update('1', { deptId: '9' } as any, ownerHead),
    ).rejects.toThrow('You cannot move subjects to a different department.');

    expect(subjectRepo.save).not.toHaveBeenCalled();
    expect(editRequests.revokeGrantsForOwner).not.toHaveBeenCalled();
  });

  it('applies the same access check to toggleActive and remove', async () => {
    const denied = createHarness();

    await expect(denied.service.toggleActive('1', requesterHead)).rejects.toThrow(
      new ForbiddenException(needRequest),
    );
    await expect(denied.service.remove('1', requesterHead)).rejects.toThrow(
      new ForbiddenException(needRequest),
    );
    expect(denied.subjectRepo.save).not.toHaveBeenCalled();
    expect(denied.subjectRepo.remove).not.toHaveBeenCalled();

    const granted = createHarness({ grant: true });
    await expect(
      granted.service.toggleActive('1', requesterHead),
    ).resolves.toMatchObject({ isActive: false });
    await expect(granted.service.remove('1', requesterHead)).resolves.toEqual({
      success: true,
    });
    expect(granted.editRequests.hasActiveGrant).toHaveBeenCalledWith('1', '9');
  });
});
