import { IdpSyncService } from '../src/modules/idp/idp-sync.service';
import { createFakeRepository } from './fakes/repository.fake';

const departmentRow = { deptId: '1', deptCode: 'CPE' };
const subjectRow = { subjectId: '10', subjectCode: 'CPE 111' };
const termRow = { termId: '5', schoolYear: '2026-2027', semester: '1st' };

function baseFaculty(overrides: Record<string, any> = {}) {
  return {
    facultyId: '1',
    wmsuId: '2019-00123',
    employeeId: null,
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    email: 'juan@wmsu.edu.ph',
    contact: null,
    deptId: '1',
    designationId: null,
    classification: 'regular',
    requiredHours: null,
    syncStatus: 'synced',
    lastSyncedAt: new Date('2026-10-01T00:00:00Z'),
    isActive: true,
    ...overrides,
  };
}

describe('IdpSyncService — Milestone 1', () => {
  let service: IdpSyncService;
  let facultyRepo: ReturnType<typeof createFakeRepository>;
  let qualRepo: ReturnType<typeof createFakeRepository>;
  let unavailabilityRepo: ReturnType<typeof createFakeRepository>;
  let departmentRepo: ReturnType<typeof createFakeRepository>;
  let subjectRepo: ReturnType<typeof createFakeRepository>;
  let termRepo: ReturnType<typeof createFakeRepository>;
  let client: any;

  beforeEach(() => {
    facultyRepo = createFakeRepository([], { idKey: 'facultyId' });
    qualRepo = createFakeRepository([], { idKey: 'qualId' });
    unavailabilityRepo = createFakeRepository([], {
      idKey: 'unavailabilityId',
    });
    departmentRepo = createFakeRepository([departmentRow], { idKey: 'deptId' });
    subjectRepo = createFakeRepository([subjectRow], { idKey: 'subjectId' });
    termRepo = createFakeRepository([termRow], { idKey: 'termId' });

    let nextFacultyId = 1;
    facultyRepo.create.mockImplementation(
      (input: Record<string, any>) =>
        ({ facultyId: String(nextFacultyId++), ...input }) as any,
    );

    const rawOne = jest.fn(async () => ({ lastSyncedAt: null }));
    facultyRepo.createQueryBuilder = jest.fn(() => {
      const builder: any = {
        select: jest.fn(() => builder),
        getRawOne: rawOne,
      };
      return builder;
    }) as any;

    client = {
      enabled: true,
      baseUrl: 'https://idp.example.test',
      hasApiKey: true,
      hasWebhookSecret: true,
      listFaculty: jest.fn(async () => []),
      listQualifications: jest.fn(async () => []),
      listUnavailability: jest.fn(async () => []),
    };

    service = new IdpSyncService(
      facultyRepo as any,
      qualRepo as any,
      unavailabilityRepo as any,
      departmentRepo as any,
      subjectRepo as any,
      termRepo as any,
      client,
    );
  });

  it('creates a faculty row and tags IDP qualifications', async () => {
    client.listFaculty.mockResolvedValue([
      {
        wmsu_id: '2019-00123',
        employee_id: null,
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        email: 'juan@wmsu.edu.ph',
        contact: null,
        department_code: 'CPE',
        is_active: true,
      },
    ]);
    client.listQualifications.mockResolvedValue([
      { faculty_wmsu_id: '2019-00123', subject_code: 'CPE 111' },
    ]);

    const summary = await service.syncFaculty({ includeQualifications: true });

    expect(summary.created).toBe(1);
    expect(summary.qualificationsAdded).toBe(1);
    expect(summary.errors).toEqual([]);

    expect(facultyRepo.rows).toHaveLength(1);
    expect(facultyRepo.rows[0]).toMatchObject({
      wmsuId: '2019-00123',
      deptId: '1',
      syncStatus: 'synced',
    });
    expect(facultyRepo.rows[0].lastSyncedAt).toBeInstanceOf(Date);

    expect(qualRepo.rows).toHaveLength(1);
    expect(qualRepo.rows[0]).toMatchObject({
      facultyId: '1',
      subjectId: '10',
      sourceSystem: 'IDP',
    });
  });

  it('is a no-op when the same roster is pulled twice', async () => {
    client.listFaculty.mockResolvedValue([
      {
        wmsu_id: '2019-00123',
        employee_id: null,
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        email: 'juan@wmsu.edu.ph',
        contact: null,
        department_code: 'CPE',
        is_active: true,
      },
    ]);

    const first = await service.syncFaculty({ includeQualifications: false });
    const second = await service.syncFaculty({ includeQualifications: false });

    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.unchanged).toBe(1);
    expect(facultyRepo.rows).toHaveLength(1);
  });

  it('rejects an unknown department without creating a row', async () => {
    client.listFaculty.mockResolvedValue([
      {
        wmsu_id: '2019-00123',
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        department_code: 'BSCPE',
        is_active: true,
      },
    ]);

    const summary = await service.syncFaculty({ includeQualifications: false });

    expect(summary.created).toBe(0);
    expect(summary.failed).toBe(1);
    expect(summary.errors[0].code).toBe('unknown_department');
    expect(facultyRepo.rows).toHaveLength(0);
  });

  it('skips a row with a pending local edit (409 local_edit_pending)', async () => {
    facultyRepo.rows.push(
      baseFaculty({
        email: 'local@wmsu.edu.ph',
        syncStatus: 'pending',
        lastSyncedAt: new Date('2026-10-01T00:00:00Z'),
      }),
    );

    client.listFaculty.mockResolvedValue([
      {
        wmsu_id: '2019-00123',
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        email: 'idp@wmsu.edu.ph',
        department_code: 'CPE',
        is_active: true,
      },
    ]);

    const summary = await service.syncFaculty({ includeQualifications: false });

    expect(summary.updated).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(summary.errors[0].code).toBe('local_edit_pending');
    expect(facultyRepo.rows[0].email).toBe('local@wmsu.edu.ph');
  });

  it('applies a webhook once and treats an identical retry as a duplicate', async () => {
    facultyRepo.rows.push(baseFaculty());

    const event = {
      event_id: 'evt-1',
      event: 'faculty.updated',
      faculty_wmsu_id: '2019-00123',
      faculty_employee_id: null,
      change_summary: { email: 'new@wmsu.edu.ph' },
      changed_at: '2026-11-08T10:00:00Z',
    };

    const first = await service.handleFacultyChange(event as any);
    const second = await service.handleFacultyChange(event as any);

    expect(first.status).toBe('applied');
    expect(second.status).toBe('duplicate');
    expect(facultyRepo.rows[0].email).toBe('new@wmsu.edu.ph');
    expect(facultyRepo.rows[0].syncStatus).toBe('synced');
  });

  it('returns 409 duplicate_key when an event id is reused with a different body', async () => {
    facultyRepo.rows.push(baseFaculty());

    const event = {
      event_id: 'evt-2',
      event: 'faculty.updated',
      faculty_wmsu_id: '2019-00123',
      change_summary: { email: 'first@wmsu.edu.ph' },
      changed_at: '2026-11-08T10:00:00Z',
    };

    await service.handleFacultyChange(event as any);

    await expect(
      service.handleFacultyChange({
        ...event,
        change_summary: { email: 'second@wmsu.edu.ph' },
      } as any),
    ).rejects.toMatchObject({
      response: { error: { code: 'duplicate_key' } },
      status: 409,
    });
  });

  it('creates a faculty row from a faculty.created webhook', async () => {
    const result = await service.handleFacultyChange({
      event_id: 'evt-3',
      event: 'faculty.created',
      faculty_wmsu_id: '2020-00001',
      faculty_employee_id: null,
      change_summary: {
        first_name: 'Maria',
        last_name: 'Santos',
        email: 'maria@wmsu.edu.ph',
        department_code: 'CPE',
        is_active: true,
      },
      changed_at: '2026-11-08T10:00:00Z',
    } as any);

    expect(result.status).toBe('applied');
    expect(facultyRepo.rows).toHaveLength(1);
    expect(facultyRepo.rows[0]).toMatchObject({
      wmsuId: '2020-00001',
      firstName: 'Maria',
      deptId: '1',
      syncStatus: 'synced',
    });
  });
});
