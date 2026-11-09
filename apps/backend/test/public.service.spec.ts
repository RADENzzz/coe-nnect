import { PublicService } from '../src/modules/public/public.service';
import { createFakeRepository } from './fakes/repository.fake';

function schedule(overrides: Record<string, any> = {}) {
  return {
    scheduleId: '1',
    termId: '5',
    subjectId: '10',
    facultyId: '1',
    externalFacultyName: null,
    roomId: '3',
    externalRoomName: null,
    section: 'A',
    sectionId: '2',
    deptId: '1',
    loadType: 'lecture',
    dayOfWeek: 'Monday',
    startTime: '08:00:00',
    endTime: '09:00:00',
    status: 'published',
    flagged: false,
    pendingFacultyRequestId: null,
    subject: {
      subjectId: '10',
      subjectCode: 'CPE 111',
      title: 'Introduction to Computing',
    },
    faculty: { facultyId: '1', firstName: 'Juan', lastName: 'Dela Cruz' },
    room: { roomId: '3', roomNumber: '101', building: 'Engineering Bldg.' },
    sectionRef: { sectionId: '2', sectionCode: 'A' },
    ...overrides,
  };
}

function faculty(overrides: Record<string, any> = {}) {
  return {
    facultyId: '1',
    wmsuId: '2019-00123',
    employeeId: 'EMP-1',
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    email: 'juan@wmsu.edu.ph',
    contact: '09170000000',
    deptId: '1',
    designationId: '2',
    classification: 'regular',
    requiredHours: null,
    syncStatus: 'synced',
    lastSyncedAt: new Date('2026-10-01T00:00:00Z'),
    isActive: true,
    ...overrides,
  };
}

function buildService(rows: {
  schedules?: any[];
  faculty?: any[];
  departments?: any[];
  subjects?: any[];
  rooms?: any[];
  terms?: any[];
  designations?: any[];
} = {}) {
  const service = new PublicService(
    createFakeRepository(rows.schedules ?? [schedule()]) as any,
    createFakeRepository(rows.faculty ?? [faculty()]) as any,
    createFakeRepository(
      rows.departments ?? [
        { deptId: '1', deptCode: 'CPE', deptName: 'Computer Engineering', isActive: true },
        { deptId: '2', deptCode: 'CE', deptName: 'Civil Engineering', isActive: false },
      ],
    ) as any,
    createFakeRepository(rows.subjects ?? [{ subjectId: '10', isActive: true }]) as any,
    createFakeRepository(rows.rooms ?? [{ roomId: '3', isActive: true }]) as any,
    createFakeRepository(
      rows.terms ?? [
        {
          termId: '5',
          termName: 'First Semester 2026-2027',
          schoolYear: '2026-2027',
          semester: '1st',
          startDate: '2026-06-01',
          endDate: '2026-10-31',
          isActive: true,
        },
      ],
    ) as any,
    createFakeRepository(
      rows.designations ?? [
        { designationId: '2', designationName: 'Instructor I' },
      ],
    ) as any,
  );

  return service;
}

describe('PublicService', () => {
  it('returns only usable published schedule rows', async () => {
    const service = buildService({
      schedules: [
        schedule({ scheduleId: '1' }),
        schedule({ scheduleId: '2', status: 'draft' }),
        schedule({ scheduleId: '3', flagged: true }),
        schedule({ scheduleId: '4', pendingFacultyRequestId: '9' }),
        schedule({ scheduleId: '5', deptId: '2' }),
        schedule({ scheduleId: '6', dayOfWeek: null }),
        schedule({ scheduleId: '7', startTime: null }),
        schedule({ scheduleId: '8', endTime: null }),
      ],
    });

    const result = await service.getSchedules();

    expect(result.entries.map((row) => row.scheduleId)).toEqual(['1']);
    expect(result.term?.termId).toBe('5');
    expect(result.terms).toHaveLength(1);
    expect(result.terms[0].publishedCount).toBe(1);
  });

  it('formats times, resolves labels, and filters by term', async () => {
    const service = buildService({
      schedules: [
        schedule({ scheduleId: '1' }),
        schedule({
          scheduleId: '2',
          termId: '6',
          facultyId: null,
          faculty: null,
          externalFacultyName: 'Prof. Guest',
          roomId: null,
          externalRoomName: 'Annex Room',
          dayOfWeek: 'Tuesday',
        }),
      ],
      terms: [
        {
          termId: '5',
          termName: 'First Semester 2026-2027',
          schoolYear: '2026-2027',
          semester: '1st',
          startDate: '2026-06-01',
          endDate: '2026-10-31',
          isActive: true,
        },
        {
          termId: '6',
          termName: 'Second Semester 2026-2027',
          schoolYear: '2026-2027',
          semester: '2nd',
          startDate: '2026-11-01',
          endDate: '2027-03-31',
          isActive: false,
        },
      ],
    });

    const result = await service.getSchedules('6');

    expect(result.term?.termCode).toBe('2026-2027-2nd');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      scheduleId: '2',
      subjectCode: 'CPE 111',
      sectionCode: 'A',
      facultyName: null,
      externalFacultyName: 'Prof. Guest',
      externalRoomName: 'Annex Room',
      startTime: '08:00',
      endTime: '09:00',
    });
  });

  it('exposes a minimal faculty directory without sensitive fields', async () => {
    const service = buildService({
      faculty: [
        faculty(),
        faculty({
          facultyId: '2',
          firstName: 'Maria',
          lastName: 'Santos',
          deptId: '2',
        }),
        faculty({
          facultyId: '3',
          firstName: 'Pedro',
          lastName: 'Reyes',
          wmsuId: null,
          syncStatus: 'pending',
          lastSyncedAt: null,
          designationId: null,
        }),
      ],
    });

    const result = await service.getFaculty();

    expect(result.total).toBe(2);
    expect(result.idpLinked).toBe(1);
    expect(result.faculty).toHaveLength(2);
    expect(result.faculty[0]).toEqual({
      facultyId: '1',
      fullName: 'Juan Dela Cruz',
      departmentCode: 'CPE',
      departmentName: 'Computer Engineering',
      designation: 'Instructor I',
      idpLinked: true,
    });
    expect(result.faculty[0]).not.toHaveProperty('email');
    expect(result.faculty[0]).not.toHaveProperty('contact');
    expect(result.faculty[0]).not.toHaveProperty('employeeId');
    expect(result.faculty[0]).not.toHaveProperty('wmsuId');
    expect(result.faculty[1].idpLinked).toBe(false);
  });

  it('aggregates public overview counts from visible rows only', async () => {
    const service = buildService({
      schedules: [
        schedule({ scheduleId: '1' }),
        schedule({ scheduleId: '2', termId: '6' }),
        schedule({ scheduleId: '3', status: 'draft' }),
      ],
      faculty: [
        faculty(),
        faculty({ facultyId: '2', deptId: '2' }),
      ],
    });

    const result = await service.getOverview();

    expect(result).toMatchObject({
      publishedEntries: 2,
      publishedTerms: 2,
      activeDepartments: 1,
      activeFaculty: 1,
      idpLinkedFaculty: 1,
      activeSubjects: 1,
      activeRooms: 1,
    });
  });
});
