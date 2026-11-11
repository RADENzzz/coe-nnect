import { IdpOutboxService } from '../src/modules/idp/idp-outbox.service';
import { IdpSchedulePublisherService } from '../src/modules/idp/idp-schedule-publisher.service';
import { IdpUpstreamError } from '../src/modules/idp/idp-client.service';
import { createFakeRepository } from './fakes/repository.fake';

const termCode = '2026-2027-1st';

function termRow() {
  return {
    termId: '5',
    schoolYear: '2026-2027',
    semester: '1st',
  };
}

function versionRow() {
  return {
    versionId: '77',
    termId: '5',
    facultyId: null,
    versionNumber: 3,
  };
}

function scheduleRow(overrides: Record<string, any> = {}) {
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
    subject: { subjectCode: 'CPE 111' },
    faculty: { wmsuId: '2019-00123', employeeId: null },
    room: { roomNumber: '101' },
    sectionRef: { sectionCode: 'A' },
    ...overrides,
  };
}

describe('IdpSchedulePublisherService — Pattern C outbox', () => {
  let scheduleRepo: ReturnType<typeof createFakeRepository>;
  let versionRepo: ReturnType<typeof createFakeRepository>;
  let termRepo: ReturnType<typeof createFakeRepository>;
  let departmentRepo: ReturnType<typeof createFakeRepository>;
  let outboxRepo: ReturnType<typeof createFakeRepository>;
  let outbox: IdpOutboxService;
  let client: any;
  let service: IdpSchedulePublisherService;

  beforeEach(() => {
    scheduleRepo = createFakeRepository([scheduleRow()], {
      idKey: 'scheduleId',
    });
    versionRepo = createFakeRepository([versionRow()], { idKey: 'versionId' });
    termRepo = createFakeRepository([termRow()], { idKey: 'termId' });
    departmentRepo = createFakeRepository([{ deptId: '1', deptCode: 'CPE' }], {
      idKey: 'deptId',
    });

    outboxRepo = createFakeRepository([], { idKey: 'outboxId' });
    let nextOutboxId = 1;
    outboxRepo.create.mockImplementation(
      (input: Record<string, any>) =>
        ({ outboxId: String(nextOutboxId++), ...input }) as any,
    );
    outbox = new IdpOutboxService(outboxRepo as any);

    client = {
      enabled: false,
      baseUrl: 'https://idp.example.test',
      pushPublishedSchedule: jest.fn(async () => ({
        status: 202,
        attempts: 1,
      })),
    };

    service = new IdpSchedulePublisherService(
      scheduleRepo as any,
      versionRepo as any,
      termRepo as any,
      departmentRepo as any,
      outbox,
      client,
    );
  });

  it('builds the contract payload from live schedule rows', async () => {
    const payload = await service.buildPayload(termCode);

    expect(payload).toMatchObject({
      coe_nnect_version_id: '77',
      version_number: 3,
      term_code: termCode,
    });
    expect(payload.entries).toEqual([
      expect.objectContaining({
        coe_nnect_schedule_id: '1',
        department_code: 'CPE',
        section_code: 'A',
        subject_code: 'CPE 111',
        faculty_wmsu_id: '2019-00123',
        room_number: '101',
        start_time: '08:00',
        end_time: '09:00',
      }),
    ]);
  });

  it('queues even when Pattern A is disabled', async () => {
    const result = await service.publishTerm(termCode);

    expect(result).toMatchObject({
      termCode,
      versionId: '77',
      versionNumber: 3,
      entryCount: 1,
      queued: true,
      attempted: false,
      delivered: false,
      skipped: 'disabled',
    });
    expect(result.outboxId).toBe('1');
    expect(outboxRepo.rows).toHaveLength(1);
    expect(client.pushPublishedSchedule).not.toHaveBeenCalled();
  });

  it('reuses the frozen payload when the same version is published again', async () => {
    const first = await service.publishTerm(termCode);

    // The live schedule changes after the first publish; the outbox item must
    // still be exactly what the Dean published.
    scheduleRepo.rows.push(
      scheduleRow({ scheduleId: '2', subject: { subjectCode: 'CPE 112' } }),
    );

    const second = await service.publishTerm(termCode);

    expect(second.outboxId).toBe(first.outboxId);
    expect(second.entryCount).toBe(1);
    expect(outboxRepo.rows).toHaveLength(1);
    expect(
      (outboxRepo.rows[0].payload as any).entries.map(
        (entry: any) => entry.coe_nnect_schedule_id,
      ),
    ).toEqual(['1']);
  });

  it('pushes over Pattern A when configured and keeps the queued copy', async () => {
    client.enabled = true;

    const result = await service.publishTerm(termCode);

    expect(result).toMatchObject({
      queued: true,
      attempted: true,
      delivered: true,
      status: 202,
      attempts: 1,
    });
    expect(client.pushPublishedSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ coe_nnect_version_id: '77' }),
    );
    expect(outboxRepo.rows).toHaveLength(1);
  });

  it('keeps the item queued when the Pattern A push fails', async () => {
    client.enabled = true;
    client.pushPublishedSchedule.mockRejectedValue(
      new IdpUpstreamError(503, 'upstream_unavailable', 'IDP is down', 5),
    );

    const result = await service.publishTerm(termCode);

    expect(result).toMatchObject({
      queued: true,
      attempted: true,
      delivered: false,
      status: 503,
      attempts: 5,
    });
    expect(result.error).toMatch(/IDP is down/);
    expect(outboxRepo.rows).toHaveLength(1);
  });

  it('marks the push not_configured when only the base URL is missing', async () => {
    client.enabled = true;
    client.baseUrl = '';

    const result = await service.publishTerm(termCode);

    expect(result).toMatchObject({
      queued: true,
      attempted: false,
      skipped: 'not_configured',
    });
    expect(client.pushPublishedSchedule).not.toHaveBeenCalled();
  });

  it('excludes rows with an open faculty request', async () => {
    scheduleRepo.rows[0].pendingFacultyRequestId = '9';

    await expect(service.buildPayload(termCode)).rejects.toMatchObject({
      status: 400,
    });
  });
});
