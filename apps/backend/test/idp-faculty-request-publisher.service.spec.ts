import { IdpOutboxService } from '../src/modules/idp/idp-outbox.service';
import { IdpFacultyRequestPublisherService } from '../src/modules/idp/idp-faculty-request-publisher.service';
import { IdpUpstreamError } from '../src/modules/idp/idp-client.service';
import { createFakeRepository } from './fakes/repository.fake';

function facultyRequest(overrides: Record<string, any> = {}) {
  return {
    requestId: '42',
    requestingDeptId: '1',
    targetDeptId: '2',
    facultyId: '7',
    subjectId: '10',
    termId: '5',
    reason: 'Needs to teach CPE 131 for the first semester.',
    status: 'pending',
    createdBy: 'user-dh',
    createdAt: new Date('2026-10-23T09:40:00Z'),
    respondedBy: null,
    respondedAt: null,
    responseRemarks: null,
    updatedAt: new Date('2026-10-23T09:40:00Z'),
    ...overrides,
  } as any;
}

describe('IdpFacultyRequestPublisherService', () => {
  let departmentRepo: ReturnType<typeof createFakeRepository>;
  let facultyRepo: ReturnType<typeof createFakeRepository>;
  let subjectRepo: ReturnType<typeof createFakeRepository>;
  let termRepo: ReturnType<typeof createFakeRepository>;
  let outboxRepo: ReturnType<typeof createFakeRepository>;
  let outbox: IdpOutboxService;
  let client: any;
  let service: IdpFacultyRequestPublisherService;

  beforeEach(() => {
    departmentRepo = createFakeRepository(
      [
        { deptId: '1', deptCode: 'CPE' },
        { deptId: '2', deptCode: 'EE' },
      ],
      { idKey: 'deptId' },
    );
    facultyRepo = createFakeRepository(
      [{ facultyId: '7', wmsuId: '2019-00123' }],
      { idKey: 'facultyId' },
    );
    subjectRepo = createFakeRepository(
      [{ subjectId: '10', subjectCode: 'CPE 131' }],
      { idKey: 'subjectId' },
    );
    termRepo = createFakeRepository(
      [{ termId: '5', schoolYear: '2026-2027', semester: '1st' }],
      { idKey: 'termId' },
    );

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
      pushFacultyRequest: jest.fn(async () => ({
        status: 202,
        attempts: 1,
      })),
    };

    service = new IdpFacultyRequestPublisherService(
      departmentRepo as any,
      facultyRepo as any,
      subjectRepo as any,
      termRepo as any,
      outbox,
      client,
    );
  });

  it('maps a faculty request to the contract 4.5 payload', async () => {
    const payload = await service.buildPayload(facultyRequest());

    expect(payload).toEqual({
      coe_nnect_request_id: '42',
      requesting_dept: 'CPE',
      target_dept: 'EE',
      faculty_wmsu_id: '2019-00123',
      subject_code: 'CPE 131',
      term_code: '2026-2027-1st',
      status: 'pending',
      reason: 'Needs to teach CPE 131 for the first semester.',
      created_at: '2026-10-23T09:40:00.000Z',
    });
  });

  it('maps a request without a faculty member to a null wmsu id', async () => {
    const payload = await service.buildPayload(
      facultyRequest({ facultyId: null }),
    );

    expect(payload.faculty_wmsu_id).toBeNull();
    expect(facultyRepo.findOne).not.toHaveBeenCalled();
  });

  it('queues a status without pushing when Pattern A is disabled', async () => {
    const result = await service.publish(facultyRequest());

    expect(result).toMatchObject({
      requestId: '42',
      status: 'pending',
      queued: true,
      outboxId: '1',
      attempted: false,
      delivered: false,
      statusCode: null,
      attempts: 0,
      skipped: 'disabled',
    });
    expect(outboxRepo.rows).toHaveLength(1);
    expect(outboxRepo.rows[0]).toMatchObject({
      kind: 'faculty_request.status',
      idempotencyKey: '42',
      payload: { coe_nnect_request_id: '42', status: 'pending' },
    });
    expect(client.pushFacultyRequest).not.toHaveBeenCalled();
  });

  it('reports not_configured when the client is enabled without a base URL', async () => {
    client.enabled = true;
    client.baseUrl = '';

    const result = await service.publish(facultyRequest());

    expect(result).toMatchObject({
      queued: true,
      attempted: false,
      delivered: false,
      skipped: 'not_configured',
    });
  });

  it('refreshes the same outbox row when the status changes', async () => {
    const queued = await service.publish(facultyRequest());
    const approved = await service.publish(
      facultyRequest({ status: 'approved', respondedAt: new Date() }),
    );

    expect(approved.outboxId).toBe(queued.outboxId);
    expect(outboxRepo.rows).toHaveLength(1);
    expect(outboxRepo.rows[0]).toMatchObject({
      kind: 'faculty_request.status',
      idempotencyKey: '42',
      payload: { coe_nnect_request_id: '42', status: 'approved' },
    });
    expect(outboxRepo.save).toHaveBeenCalledTimes(1);
    expect(outboxRepo.update).toHaveBeenCalledTimes(1);
    expect(outboxRepo.update).toHaveBeenCalledWith(
      { kind: 'faculty_request.status', idempotencyKey: '42' },
      expect.objectContaining({
        payload: expect.objectContaining({ status: 'approved' }),
        createdAt: expect.any(Date),
      }),
    );
  });

  it('pushes the latest status when Pattern A is configured', async () => {
    client.enabled = true;

    const result = await service.publish(
      facultyRequest({ status: 'approved' }),
    );

    expect(result).toMatchObject({
      queued: true,
      attempted: true,
      delivered: true,
      statusCode: 202,
      attempts: 1,
    });
    expect(client.pushFacultyRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        coe_nnect_request_id: '42',
        status: 'approved',
      }),
    );
    expect(outboxRepo.rows).toHaveLength(1);
  });

  it('keeps the item queued when the Pattern A push fails', async () => {
    client.enabled = true;
    client.pushFacultyRequest.mockRejectedValue(
      new IdpUpstreamError(503, 'internal_error', 'IDP is down', 5),
    );

    const result = await service.publish(
      facultyRequest({ status: 'rejected' }),
    );

    expect(result).toMatchObject({
      queued: true,
      attempted: true,
      delivered: false,
      statusCode: 503,
      attempts: 5,
    });
    expect(result.error).toMatch(/IDP is down/);
    expect(outboxRepo.rows).toHaveLength(1);
  });

  it('rejects a request that references a missing department', async () => {
    await expect(
      service.publish(facultyRequest({ targetDeptId: '999' })),
    ).rejects.toThrow(/references a department that does not exist/);
    expect(outboxRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a request that references a missing subject', async () => {
    await expect(
      service.publish(facultyRequest({ subjectId: '999' })),
    ).rejects.toThrow(/references a subject that does not exist/);
  });

  it('rejects a request that references a missing term', async () => {
    await expect(
      service.publish(facultyRequest({ termId: '999' })),
    ).rejects.toThrow(/references a term without a semester/);
  });
});
