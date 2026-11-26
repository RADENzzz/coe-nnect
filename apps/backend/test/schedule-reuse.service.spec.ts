import 'reflect-metadata';

import { strict as assert } from 'node:assert';
import {
  ScheduleReuseService,
  type ReuseCandidate,
} from '../src/modules/scheduling/services/schedule-reuse.service';
import type { PublishedVersionEntry } from '../src/modules/scheduling/services/term-published-version.service';
import { createFakeRepository } from './fakes/repository.fake';
import { otherDepartmentHeadProfile } from './helpers/profiles';

const dhProfile = otherDepartmentHeadProfile; // deptId 2
const adminProfile = { userId: 'admin', role: 'administrator', deptId: null };
const dto = { termId: '1', deptId: '2' };

type Repo = ReturnType<typeof createFakeRepository>;

/**
 * Tiny thenable Supabase query builder. Each table returns a fixed payload;
 * every chain method returns the same object so `.eq().eq()` and
 * `.in().eq().eq()` both resolve to `{ data, error }`.
 */
function query(data: unknown) {
  const result: any = { data, error: null };
  result.select = jest.fn(() => result);
  result.eq = jest.fn(() => result);
  result.in = jest.fn(() => result);
  result.delete = jest.fn(() => result);
  result.maybeSingle = jest.fn(async () => ({ data, error: null }));
  result.single = jest.fn(async () => ({ data, error: null }));
  result.then = (resolve: any, reject: any) =>
    Promise.resolve({ data, error: null }).then(resolve, reject);
  return result;
}

function supabaseFake(
  prospectus: string[] = ['S1', 'S2'],
  programIds: string[] = ['P1'],
  term: Record<string, unknown> = {
    semester: '1st',
    term_name: 'First Semester',
    is_active: true,
  },
  facultyRequestQuery = query(null),
) {
  const from = jest.fn((table: string) => {
    if (table === 'faculty_request') {
      return facultyRequestQuery;
    }
    if (table === 'term') {
      return query(term);
    }
    if (table === 'program') {
      return query(programIds.map((id) => ({ program_id: id })));
    }
    if (table === 'prospectus') {
      return query(prospectus.map((subjectId) => ({ subject_id: subjectId })));
    }
    if (table === 'department') {
      return query({ dept_code: 'CPE' });
    }
    if (table === 'subject') {
      return query({ subject_code: 'CODE-S1', title: 'Subject S1' });
    }
    return query(null);
  });
  return {
    getAdminClient: jest.fn(() => ({ from })),
    facultyRequestQuery,
  };
}

function entry(
  overrides: Partial<PublishedVersionEntry> & Record<string, unknown> = {},
): PublishedVersionEntry {
  return {
    schedule_id: 'src-1',
    subject_id: 'S1',
    subject_code: 'CODE-S1',
    subject_title: 'Subject S1',
    section_id: 'SEC1',
    section_code: 'SEC1',
    faculty_id: null,
    external_faculty_name: 'Prof X',
    faculty_name: 'Prof X',
    room_id: '101',
    room_number: 'R-101',
    building: null,
    external_room_name: null,
    day_of_week: 'Monday',
    start_time: '08:00',
    end_time: '10:00',
    load_type: 'lecture',
    status: 'published',
    remarks: null,
    dept_id: '2',
    session_index: 0,
    ...overrides,
  } as PublishedVersionEntry;
}

function currentRow(
  subjectId: string,
  sectionId: string,
  loadType: string,
  sessionIndex: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    scheduleId: 'draft-1',
    termId: '1',
    subjectId,
    sectionId,
    section: sectionId,
    facultyId: null,
    externalFacultyName: 'Prof X',
    roomId: null,
    externalRoomName: null,
    dayOfWeek: 'Monday',
    startTime: '08:00:00',
    endTime: '10:00:00',
    loadType,
    status: 'draft',
    remarks: null,
    deptId: '2',
    pendingFacultyRequestId: null,
    pendingFacultyDeptId: null,
    sessionIndex,
    ...overrides,
  };
}

describe('ScheduleReuseService', () => {
  let scheduleRepo: Repo;
  let subjectRepo: Repo;
  let roomRepo: Repo;
  let facultyRepo: Repo;
  let sectionRepo: Repo;
  let publishedVersions: { entriesFor: jest.Mock };
  let ruleContextBuilder: { build: jest.Mock };
  let constraints: { evaluate: jest.Mock };
  let facultyGate: { ensureCrossDeptFacultyRequest: jest.Mock };
  let dispatcher: { dispatch: jest.Mock };
  let recipients: { departmentHeadsOf: jest.Mock };
  let departments: { isActive: jest.Mock };
  let supabase: ReturnType<typeof supabaseFake>;
  let service: ScheduleReuseService;

  function createService(client = supabase) {
    return new ScheduleReuseService(
      scheduleRepo as any,
      subjectRepo as any,
      roomRepo as any,
      facultyRepo as any,
      sectionRepo as any,
      publishedVersions as any,
      ruleContextBuilder as any,
      constraints as any,
      facultyGate as any,
      client as any,
      dispatcher as any,
      recipients as any,
      departments as any,
    );
  }

  beforeEach(() => {
    scheduleRepo = createFakeRepository([], { idKey: 'scheduleId', autoId: true });
    subjectRepo = createFakeRepository([
      { subjectId: 'S1', subjectCode: 'CODE-S1', title: 'Subject S1', deptId: '3', isActive: true },
      { subjectId: 'S2', subjectCode: 'CODE-S2', title: 'Subject S2', deptId: '2', isActive: true },
    ]);
    roomRepo = createFakeRepository([
      { roomId: '101', roomNumber: 'R-101', building: 'Main', isActive: true },
    ]);
    facultyRepo = createFakeRepository([
      { facultyId: 'F1', firstName: 'Jane', lastName: 'Doe', deptId: '3', isActive: true },
    ]);
    sectionRepo = createFakeRepository([
      { sectionId: 'SEC1', sectionCode: 'SEC1', isActive: true },
      { sectionId: 'SEC2', sectionCode: 'SEC2', isActive: true },
    ]);

    publishedVersions = { entriesFor: jest.fn(async () => []) };
    ruleContextBuilder = { build: jest.fn(async (input: any) => ({ input })) };
    constraints = {
      evaluate: jest.fn(() => ({
        valid: true,
        hardConflicts: [],
        softWarnings: [],
        evaluations: [],
      })),
    };
    facultyGate = { ensureCrossDeptFacultyRequest: jest.fn(async () => null) };
    dispatcher = { dispatch: jest.fn(async () => undefined) };
    recipients = { departmentHeadsOf: jest.fn(async () => ['dh-target']) };
    departments = { isActive: jest.fn(async () => true) };
    supabase = supabaseFake();

    service = createService();
  });

  function seedEntries(...entries: PublishedVersionEntry[]) {
    publishedVersions.entriesFor.mockResolvedValue(entries);
  }

  function seedCurrentRows(options: {
    draftWithPendingRequest?: boolean;
    published?: boolean;
    finalized?: boolean;
  }) {
    if (options.draftWithPendingRequest) {
      scheduleRepo.rows.push(
        currentRow('S1', 'SEC1', 'lecture', 0, {
          scheduleId: 'draft-pending',
          pendingFacultyRequestId: '55',
          pendingFacultyDeptId: '3',
        }),
      );
    }
    if (options.published) {
      scheduleRepo.rows.push(
        currentRow('S1', 'SEC1', 'lecture', 0, {
          scheduleId: 'protected-published',
          status: 'published',
        }),
      );
    }
    if (options.finalized) {
      scheduleRepo.rows.push(
        currentRow('S1', 'SEC1', 'lecture', 0, {
          scheduleId: 'protected-finalized',
          status: 'finalized',
        }),
      );
    }
  }

  it('fails with a summary and plots nothing when no published subject matches the prospectus', async () => {
    seedEntries(entry({ subject_id: 'S-NO', subject_code: 'CODE-NO', faculty_name: 'Prof X' }));

    const result = await service.preflight('9', dto, dhProfile);

    assert.equal(result.failed, true);
    assert.equal(result.ready, 0);
    assert.equal(result.skipped, 1);
    assert.match(result.summary, /no published.*match/i);
    assert.equal(publishedVersions.entriesFor.mock.calls.length, 1);
    assert.equal(publishedVersions.entriesFor.mock.calls[0][0], '9');
    assert.deepEqual(publishedVersions.entriesFor.mock.calls[0][1], ['published']);
    assert.equal(scheduleRepo.save.mock.calls.length, 0);
    assert.equal(ruleContextBuilder.build.mock.calls.length, 0);
  });

  it('uses only published entries and keeps protected or pending-request drafts untouched', async () => {
    seedEntries(
      entry({ status: 'draft' }),
      entry({ status: 'published' }),
      entry({ status: 'finalized' }),
    );
    seedCurrentRows({
      draftWithPendingRequest: true,
      published: true,
      finalized: true,
    });

    const result = await service.preflight('9', dto, dhProfile);

    assert.equal(result.matched, 1);
    assert.equal(result.keptAsIs, 2);
    assert.equal(result.conflicts.length, 1);
    assert.match(result.conflicts[0]?.reason ?? '', /pending faculty request/i);
    assert.equal(result.ready, 0);
    assert.deepEqual(
      scheduleRepo.rows.map((row) => row.status).sort(),
      ['draft', 'finalized', 'published'],
    );
    assert.equal(scheduleRepo.save.mock.calls.length, 0);
  });

  it('pairs two sessions of the same subject by session_index', async () => {
    seedEntries(
      entry({ schedule_id: 'src-0', session_index: 0, day_of_week: 'Monday' }),
      entry({ schedule_id: 'src-1', session_index: 1, day_of_week: 'Tuesday' }),
    );

    const result = await service.preflight('9', dto, dhProfile);

    assert.equal(result.matched, 2);
    assert.equal(result.ready, 2);
    assert.deepEqual(result.conflicts, []);

    const applied = await service.apply(
      '9',
      { ...dto, confirmed: true },
      dhProfile,
    );
    assert.equal(applied.created.length, 2);
    assert.deepEqual(
      applied.created.map((row) => row.dayOfWeek).sort(),
      ['Monday', 'Tuesday'],
    );
  });

  it('pairs sessions by numeric schedule id order across the 9/10 boundary', async () => {
    scheduleRepo.rows.push(
      currentRow('S1', 'SEC1', 'lecture', 0, { scheduleId: '9' }),
      currentRow('S1', 'SEC1', 'lecture', 0, { scheduleId: '10' }),
    );
    seedEntries(
      entry({ schedule_id: 'src-0', session_index: 0, day_of_week: 'Monday' }),
      entry({ schedule_id: 'src-1', session_index: 1, day_of_week: 'Tuesday' }),
    );

    const applied = await service.apply(
      '9',
      { ...dto, confirmed: true },
      dhProfile,
    );

    assert.equal(applied.updated.length, 2);
    assert.deepEqual(
      applied.updated.map((row) => [row.scheduleId, row.dayOfWeek]),
      [
        ['9', 'Monday'],
        ['10', 'Tuesday'],
      ],
    );
    assert.deepEqual(
      scheduleRepo.rows
        .filter((row) => row.scheduleId === '9' || row.scheduleId === '10')
        .map((row) => [row.scheduleId, row.dayOfWeek, row.status]),
      [
        ['9', 'Monday', 'draft'],
        ['10', 'Tuesday', 'draft'],
      ],
    );
  });

  it('passes externalRoomName to the rule context and files a cross-department request on apply', async () => {
    scheduleRepo.rows.push(currentRow('S1', 'SEC1', 'lecture', 0));
    seedEntries(
      entry({
        faculty_id: '888',
        external_faculty_name: null,
        faculty_name: 'Jane Doe',
        external_room_name: 'Annex A',
      }),
    );
    facultyGate.ensureCrossDeptFacultyRequest.mockResolvedValue({
      requestId: '77',
      facultyDeptId: '3',
      created: true,
    });

    const result = await service.apply(
      '9',
      { ...dto, confirmed: true },
      dhProfile,
    );

    assert.equal(result.updated.length, 1);
    assert.deepEqual(result.conflicts, []);
    const contextInput = ruleContextBuilder.build.mock.calls[0][0];
    assert.equal(contextInput.externalRoomName, 'Annex A');
    assert.equal(contextInput.excludeScheduleId, 'draft-1');
    assert.deepEqual(facultyGate.ensureCrossDeptFacultyRequest.mock.calls[0][0], {
      facultyId: 'F1',
      scheduleDeptId: '2',
      termId: '1',
      subjectId: 'S1',
      user: dhProfile,
    });
    assert.equal(facultyGate.ensureCrossDeptFacultyRequest.mock.calls.length, 1);
    const [, payload] = dispatcher.dispatch.mock.calls[0];
    assert.equal(payload.entityId, '77');
    assert.equal(payload.payload.reason, 'schedule_reuse');
    assert.equal(payload.payload.subjectId, 'S1');
    assert.equal(payload.payload.facultyId, 'F1');
  });

  it('creates the cross-department gate before rule validation in apply', async () => {
    const order: string[] = [];
    facultyGate.ensureCrossDeptFacultyRequest.mockImplementation(async () => {
      order.push('gate');
      return { requestId: '77', facultyDeptId: '3', created: true };
    });
    ruleContextBuilder.build.mockImplementation(async () => {
      order.push('build');
      return { input: {} };
    });
    constraints.evaluate.mockImplementation(() => {
      order.push('evaluate');
      return {
        valid: true,
        hardConflicts: [],
        softWarnings: [],
        evaluations: [],
      };
    });
    seedEntries(
      entry({
        faculty_id: 'F1',
        external_faculty_name: null,
        faculty_name: 'Jane Doe',
      }),
    );

    await service.apply('9', { ...dto, confirmed: true }, dhProfile);

    assert.deepEqual(order, ['gate', 'build', 'evaluate']);
    assert.equal(facultyGate.ensureCrossDeptFacultyRequest.mock.calls.length, 1);
  });

  it('makes the newly created gate visible to the rule context before evaluation', async () => {
    let createdRequestId: string | null = null;
    let evaluatedRequestId: string | null = null;
    facultyGate.ensureCrossDeptFacultyRequest.mockImplementation(async () => {
      createdRequestId = '88';
      return { requestId: '88', facultyDeptId: '3', created: true };
    });
    ruleContextBuilder.build.mockImplementation(async () => ({
      approvedFacultyRequests: createdRequestId
        ? [
            {
              requestId: createdRequestId,
              facultyId: 'F1',
              subjectId: 'S1',
              termId: '1',
            },
          ]
        : [],
    }));
    constraints.evaluate.mockImplementation((context: any) => {
      evaluatedRequestId = context.approvedFacultyRequests?.[0]?.requestId ?? null;
      return evaluatedRequestId === '88'
        ? {
            valid: true,
            hardConflicts: [],
            softWarnings: [],
            evaluations: [],
          }
        : {
            valid: false,
            hardConflicts: [
              {
                ruleId: 'F-8',
                ruleName: 'Cross-dept request',
                reason: 'no pending request',
              },
            ],
            softWarnings: [],
            evaluations: [],
          };
    });
    scheduleRepo.rows.push(currentRow('S1', 'SEC1', 'lecture', 0));
    seedEntries(
      entry({
        faculty_id: 'F1',
        external_faculty_name: null,
        faculty_name: 'Jane Doe',
      }),
    );

    const result = await service.apply(
      '9',
      { ...dto, confirmed: true },
      dhProfile,
    );

    assert.equal(evaluatedRequestId, '88');
    assert.equal(result.updated.length, 1);
    assert.deepEqual(result.conflicts, []);
  });

  it('rolls back a newly created gate and writes nothing when constraints hard-fail in apply', async () => {
    seedEntries(
      entry({
        faculty_id: 'F1',
        external_faculty_name: null,
        faculty_name: 'Jane Doe',
      }),
    );
    facultyGate.ensureCrossDeptFacultyRequest.mockResolvedValue({
      requestId: '79',
      facultyDeptId: '3',
      created: true,
    });
    constraints.evaluate.mockReturnValue({
      valid: false,
      hardConflicts: [
        { ruleId: 'H-9', ruleName: 'Blocked', reason: 'hard stop' },
      ],
      softWarnings: [],
      evaluations: [],
    });

    const result = await service.apply(
      '9',
      { ...dto, confirmed: true },
      dhProfile,
    );

    assert.equal(result.created.length, 0);
    assert.equal(result.updated.length, 0);
    assert.equal(result.conflicts.length, 1);
    assert.match(result.conflicts[0]?.reason ?? '', /H-9/);
    assert.equal(scheduleRepo.save.mock.calls.length, 0);
    assert.equal(dispatcher.dispatch.mock.calls.length, 0);
    assert.equal(supabase.facultyRequestQuery.delete.mock.calls.length, 1);
    const rollbackEq = supabase.facultyRequestQuery.eq.mock.calls[0];
    assert.equal(rollbackEq[0], 'request_id');
    assert.equal(rollbackEq[1], '79');
  });

  it('does not roll back a reused pending faculty request when constraints hard-fail', async () => {
    seedEntries(
      entry({
        faculty_id: 'F1',
        external_faculty_name: null,
        faculty_name: 'Jane Doe',
      }),
    );
    facultyGate.ensureCrossDeptFacultyRequest.mockResolvedValue({
      requestId: '77',
      facultyDeptId: '3',
      created: false,
    });
    constraints.evaluate.mockReturnValue({
      valid: false,
      hardConflicts: [
        { ruleId: 'H-9', ruleName: 'Blocked', reason: 'hard stop' },
      ],
      softWarnings: [],
      evaluations: [],
    });

    const result = await service.apply(
      '9',
      { ...dto, confirmed: true },
      dhProfile,
    );

    assert.equal(result.conflicts.length, 1);
    assert.match(result.conflicts[0]?.reason ?? '', /H-9/);
    assert.equal(result.created.length, 0);
    assert.equal(result.updated.length, 0);
    assert.equal(scheduleRepo.save.mock.calls.length, 0);
    assert.equal(dispatcher.dispatch.mock.calls.length, 0);
    assert.equal(supabase.facultyRequestQuery.delete.mock.calls.length, 0);
    assert.equal(supabase.facultyRequestQuery.eq.mock.calls.length, 0);
  });

  it('remaps catalog rows by code and otherwise reports a conflict with a reason', async () => {
    seedEntries(
      entry({ schedule_id: 'old-room', room_id: '999', room_number: 'R-101' }),
      entry({
        schedule_id: 'bad-faculty',
        subject_id: 'S2',
        subject_code: 'CODE-S2',
        subject_title: 'Subject S2',
        section_id: 'SEC2',
        section_code: 'SEC2',
        faculty_id: '888',
        faculty_name: 'Missing Professor',
        external_faculty_name: null,
      }),
    );

    const result = await service.preflight('9', dto, dhProfile);

    assert.equal(result.ready, 1);
    assert.equal(result.conflicts.length, 1);
    assert.match(result.conflicts[0]?.reason ?? '', /faculty/i);
    assert.equal(result.conflicts[0]?.action, 'conflict');
    const contextInput = ruleContextBuilder.build.mock.calls[0][0];
    assert.equal(contextInput.roomId, '101');
  });

  it('remaps a stale subject id by code before prospectus matching', async () => {
    seedEntries(
      entry({
        subject_id: '999',
        subject_code: 'CODE-S1',
        subject_title: 'Subject S1',
      }),
    );

    const result = await service.preflight('9', dto, dhProfile);

    assert.equal(result.matched, 1);
    assert.equal(result.ready, 1);
    assert.deepEqual(result.conflicts, []);
    assert.equal(ruleContextBuilder.build.mock.calls[0][0].subjectId, 'S1');
  });

  it('writes only draft rows and returns unresolved conflicts from apply', async () => {
    scheduleRepo.rows.push(
      currentRow('S1', 'SEC1', 'lecture', 0),
      currentRow('S3', 'SEC3', 'lecture', 0, {
        scheduleId: 'protected-published',
        status: 'published',
      }),
    );
    seedEntries(
      entry({
        schedule_id: 'src-updated',
        day_of_week: 'Wednesday',
        start_time: '09:00',
        end_time: '11:00',
      }),
      entry({
        schedule_id: 'src-created',
        session_index: 1,
        day_of_week: 'Tuesday',
      }),
      entry({
        schedule_id: 'bad-faculty',
        subject_id: 'S2',
        subject_code: 'CODE-S2',
        section_id: 'SEC2',
        section_code: 'SEC2',
        faculty_id: '888',
        faculty_name: 'Missing Professor',
        external_faculty_name: null,
      }),
    );

    const result = await service.apply(
      '9',
      { ...dto, confirmed: true },
      dhProfile,
    );

    assert.equal(result.failed, false);
    assert.equal(result.updated.length, 1);
    assert.equal(result.updated[0].scheduleId, 'draft-1');
    assert.equal(result.updated[0].status, 'draft');
    assert.equal(result.updated[0].dayOfWeek, 'Wednesday');
    assert.equal(result.created.length, 1);
    assert.equal(result.created[0].status, 'draft');
    assert.equal(result.conflicts.length, 1);
    assert.match(result.conflicts[0].reason ?? '', /faculty/i);
    assert.deepEqual(
      scheduleRepo.rows.map((row) => row.status).sort(),
      ['draft', 'draft', 'published'],
    );
    assert.equal(
      scheduleRepo.rows.find((row) => row.scheduleId === 'protected-published')
        ?.dayOfWeek,
      'Monday',
    );
  });

  it('files conflicts from hard rules but keeps soft warnings non-blocking', async () => {
    seedEntries(
      entry({ schedule_id: 'src-hard', subject_id: 'S1' }),
      entry({
        schedule_id: 'src-soft',
        subject_id: 'S2',
        subject_code: 'CODE-S2',
        section_id: 'SEC2',
        section_code: 'SEC2',
      }),
    );
    constraints.evaluate
      .mockReturnValueOnce({
        valid: false,
        hardConflicts: [
          { ruleId: 'H-2', ruleName: 'Room Overlap', reason: 'room is busy' },
        ],
        softWarnings: [],
        evaluations: [],
      })
      .mockReturnValueOnce({
        valid: true,
        hardConflicts: [],
        softWarnings: [
          { ruleId: 'S-3', ruleName: 'Workload', reason: 'near the cap' },
        ],
        evaluations: [],
      });

    const result = await service.preflight('9', dto, dhProfile);

    assert.equal(result.ready, 1);
    assert.equal(result.warnings, 1);
    assert.equal(result.conflicts.length, 1);
    assert.match(result.conflicts[0].reason ?? '', /H-2/);
  });

  it('dispatches request.submitted with schedule_reuse on apply', async () => {
    seedEntries(entry({ faculty_id: 'F1', external_faculty_name: null }));
    facultyGate.ensureCrossDeptFacultyRequest.mockResolvedValue({
      requestId: '77',
      facultyDeptId: '3',
      created: true,
    });

    await service.apply('9', { ...dto, confirmed: true }, dhProfile);

    assert.equal(dispatcher.dispatch.mock.calls.length, 1);
    const [trigger, payload] = dispatcher.dispatch.mock.calls[0];
    assert.equal(trigger, 'request.submitted');
    assert.equal(payload.payload.reason, 'schedule_reuse');
    assert.equal(payload.entityId, '77');
  });

  it('does not file faculty requests or dispatch notifications during preflight', async () => {
    seedEntries(
      entry({
        faculty_id: 'F1',
        faculty_name: 'Jane Doe',
        external_faculty_name: null,
      }),
    );
    facultyGate.ensureCrossDeptFacultyRequest.mockResolvedValue({
      requestId: '77',
      facultyDeptId: '3',
      created: true,
    });

    const result = await service.preflight('9', dto, dhProfile);

    assert.equal(result.ready, 1);
    assert.deepEqual(result.conflicts, []);
    assert.equal(facultyGate.ensureCrossDeptFacultyRequest.mock.calls.length, 0);
    assert.equal(dispatcher.dispatch.mock.calls.length, 0);
    assert.equal(scheduleRepo.save.mock.calls.length, 0);
  });

  it('rejects missing or inactive target terms before reading entries or writing', async () => {
    seedEntries(entry());
    const inactive = createService(
      supabaseFake(['S1', 'S2'], ['P1'], {
        semester: '1st',
        term_name: 'First Semester',
        is_active: false,
      }),
    );
    await assert.rejects(
      () => inactive.preflight('9', dto, dhProfile),
      /not active/i,
    );
    await assert.rejects(
      () => inactive.apply('9', { ...dto, confirmed: true }, dhProfile),
      /not active/i,
    );

    const missing = createService(supabaseFake(['S1', 'S2'], ['P1'], null));
    await assert.rejects(
      () => missing.preflight('9', dto, dhProfile),
      /not found/i,
    );
    await assert.rejects(
      () => missing.apply('9', { ...dto, confirmed: true }, dhProfile),
      /not found/i,
    );

    assert.equal(publishedVersions.entriesFor.mock.calls.length, 0);
    assert.equal(ruleContextBuilder.build.mock.calls.length, 0);
    assert.equal(scheduleRepo.save.mock.calls.length, 0);
  });

  it('refuses a department head targeting another department or without a dept id', async () => {
    await assert.rejects(
      () => service.preflight('9', dto, { ...dhProfile, deptId: '1' }),
      /own department/i,
    );
    await assert.rejects(
      () => service.preflight('9', dto, { ...dhProfile, deptId: null }),
      /department id/i,
    );
    assert.equal(publishedVersions.entriesFor.mock.calls.length, 0);
    assert.equal(scheduleRepo.save.mock.calls.length, 0);
  });

  it('requires confirmed true before applying anything', async () => {
    seedEntries(entry());
    await assert.rejects(
      () => service.apply('9', { ...dto, confirmed: false }, dhProfile),
      /confirm/i,
    );
    assert.equal(scheduleRepo.save.mock.calls.length, 0);
  });

  it('lets an administrator reuse into any department', async () => {
    seedEntries(entry());
    const result = await service.preflight('9', dto, adminProfile);
    assert.equal(result.ready, 1);
  });
});
