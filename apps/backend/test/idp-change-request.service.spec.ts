import { IdpChangeRequestService } from '../src/modules/idp/idp-change-request.service';
import { IdpOutboxService } from '../src/modules/idp/idp-outbox.service';
import { IdpUpstreamError } from '../src/modules/idp/idp-client.service';
import { createFakeRepository } from './fakes/repository.fake';

function changeRequest(overrides: Record<string, any> = {}) {
  return {
    idp_request_id: 'IDP-REQ-0001',
    type: 'unavailability_change',
    faculty_wmsu_id: '2019-00123',
    faculty_employee_id: null,
    affected_dates: ['2026-03-15'],
    details: {
      term_code: '2026-2027-1st',
      day_of_week: 'Monday',
      start_time: '13:00',
      end_time: '15:00',
      reason: 'External load',
      external_id: 'IDP-UNAV-0001',
    },
    severity: 'warning',
    requires_ack: true,
    created_at: '2026-10-23T09:40:00Z',
    ...overrides,
  };
}

describe('IdpChangeRequestService', () => {
  let changeRepo: ReturnType<typeof createFakeRepository>;
  let facultyRepo: ReturnType<typeof createFakeRepository>;
  let departmentRepo: ReturnType<typeof createFakeRepository>;
  let subjectRepo: ReturnType<typeof createFakeRepository>;
  let termRepo: ReturnType<typeof createFakeRepository>;
  let sectionRepo: ReturnType<typeof createFakeRepository>;
  let designationRepo: ReturnType<typeof createFakeRepository>;
  let outboxRepo: ReturnType<typeof createFakeRepository>;
  let outbox: IdpOutboxService;
  let client: any;
  let service: IdpChangeRequestService;

  beforeEach(() => {
    changeRepo = createFakeRepository([], { idKey: 'idpRequestId' });
    facultyRepo = createFakeRepository(
      [
        {
          facultyId: '1',
          wmsuId: '2019-00123',
          employeeId: null,
          deptId: '1',
        },
      ],
      { idKey: 'facultyId' },
    );
    departmentRepo = createFakeRepository(
      [
        { deptId: '1', deptCode: 'CPE' },
        { deptId: '2', deptCode: 'EE' },
      ],
      { idKey: 'deptId' },
    );
    subjectRepo = createFakeRepository(
      [{ subjectId: '10', subjectCode: 'CPE 131' }],
      { idKey: 'subjectId' },
    );
    termRepo = createFakeRepository(
      [{ termId: '5', schoolYear: '2026-2027', semester: '1st' }],
      { idKey: 'termId' },
    );
    sectionRepo = createFakeRepository(
      [{ sectionId: '2', sectionCode: 'CpE-1A' }],
      { idKey: 'sectionId' },
    );
    designationRepo = createFakeRepository(
      [{ designationId: '3', designationName: 'Instructor' }],
      { idKey: 'designationId' },
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
      pushChangeRequestAck: jest.fn(async () => ({
        status: 202,
        attempts: 1,
      })),
    };

    service = new IdpChangeRequestService(
      changeRepo as any,
      facultyRepo as any,
      departmentRepo as any,
      subjectRepo as any,
      termRepo as any,
      sectionRepo as any,
      designationRepo as any,
      outbox,
      client,
    );
  });

  it('persists a valid change request as pending', async () => {
    const result = await service.receive(changeRequest());

    expect(result).toEqual({
      idp_request_id: 'IDP-REQ-0001',
      status: 'pending',
      requires_ack: true,
      faculty_id: '1',
    });
    expect(changeRepo.rows).toHaveLength(1);
    expect(changeRepo.rows[0]).toMatchObject({
      idpRequestId: 'IDP-REQ-0001',
      type: 'unavailability_change',
      status: 'pending',
      facultyWmsuId: '2019-00123',
      requiresAck: true,
    });
  });

  it('answers duplicate for the same id and body', async () => {
    await service.receive(changeRequest());
    const second = await service.receive(changeRequest());

    expect(second.status).toBe('duplicate');
    expect(changeRepo.rows).toHaveLength(1);
    expect(changeRepo.save).toHaveBeenCalledTimes(1);
  });

  it('rejects a reused id with a different body', async () => {
    await service.receive(changeRequest());

    await expect(
      service.receive(
        changeRequest({
          details: {
            term_code: '2026-2027-1st',
            day_of_week: 'Tuesday',
            start_time: '13:00',
            end_time: '15:00',
          },
        }),
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'duplicate_key' } },
      status: 409,
    });
  });

  it('rejects an unknown faculty key', async () => {
    await expect(
      service.receive(changeRequest({ faculty_wmsu_id: 'missing' })),
    ).rejects.toMatchObject({
      response: { error: { code: 'unknown_faculty' } },
      status: 422,
    });
  });

  it('rejects an unknown subject in a qualification request', async () => {
    await expect(
      service.receive(
        changeRequest({
          type: 'qualification_add',
          details: { subject_code: 'NOPE 101' },
        }),
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'unknown_subject' } },
      status: 422,
    });
  });

  it('rejects an unknown designation in a faculty update', async () => {
    await expect(
      service.receive(
        changeRequest({
          type: 'faculty_update',
          details: { designation_id: '999' },
        }),
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'unknown_designation' } },
      status: 422,
    });
  });

  it('rejects an unknown term and an unknown section', async () => {
    await expect(
      service.receive(
        changeRequest({
          details: {
            term_code: '2025-2026-1st',
            day_of_week: 'Monday',
            start_time: '13:00',
            end_time: '15:00',
          },
        }),
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'unknown_term' } },
      status: 422,
    });

    await expect(
      service.receive(
        changeRequest({
          type: 'schedule_override',
          details: {
            term_code: '2026-2027-1st',
            subject_code: 'CPE 131',
            section_code: 'NOPE-1A',
            day_of_week: 'Monday',
            start_time: '08:00',
            end_time: '09:30',
          },
        }),
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'unknown_section' } },
      status: 422,
    });
  });

  it('rejects an unsupported change-request type', async () => {
    await expect(
      service.receive(changeRequest({ type: 'not_a_type' })),
    ).rejects.toMatchObject({
      response: { error: { code: 'validation_error' } },
      status: 422,
    });
  });

  it('accepts a faculty_create whose keys live in details', async () => {
    const result = await service.receive(
      changeRequest({
        type: 'faculty_create',
        faculty_wmsu_id: null,
        faculty_employee_id: null,
        details: {
          first_name: 'Juan',
          last_name: 'Dela Cruz',
          wmsu_id: '2019-00123',
          department_code: 'CPE',
          is_active: true,
        },
      }),
    );

    expect(result).toMatchObject({
      status: 'pending',
      faculty_id: '1',
    });
  });

  it('records one ack and queues it for the IDP desktop', async () => {
    await service.receive(changeRequest());
    const result = await service.acknowledge(
      'IDP-REQ-0001',
      { action: 'accepted', notes: 'Applied to the term.' },
      'user-dean',
    );

    expect(result).toMatchObject({
      idp_request_id: 'IDP-REQ-0001',
      action: 'accepted',
      duplicate: false,
      queued: true,
      attempted: false,
      delivered: false,
      skipped: 'disabled',
    });
    expect(changeRepo.rows[0]).toMatchObject({
      status: 'acknowledged',
      ackAction: 'accepted',
      ackNotes: 'Applied to the term.',
      acknowledgedBy: 'user-dean',
    });
    expect(outboxRepo.rows).toHaveLength(1);
    expect(outboxRepo.rows[0]).toMatchObject({
      kind: 'change_request.ack',
      idempotencyKey: 'IDP-REQ-0001',
      payload: {
        idp_request_id: 'IDP-REQ-0001',
        acknowledged_by_coe_nnect_user_id: 'user-dean',
        action: 'accepted',
        notes: 'Applied to the term.',
      },
    });
  });

  it('treats the same acknowledgement as idempotent', async () => {
    await service.receive(changeRequest());
    await service.acknowledge(
      'IDP-REQ-0001',
      { action: 'accepted', notes: 'OK' },
      'user-dean',
    );
    const second = await service.acknowledge(
      'IDP-REQ-0001',
      { action: 'accepted', notes: 'OK' },
      'user-dean',
    );

    expect(second.duplicate).toBe(true);
    expect(second.queued).toBe(true);
    expect(outboxRepo.rows).toHaveLength(1);
    expect(changeRepo.save).toHaveBeenCalledTimes(1); // receive only
    expect(changeRepo.update).toHaveBeenCalledTimes(1); // first ack only
  });

  it('rejects a second, different acknowledgement', async () => {
    await service.receive(changeRequest());
    await service.acknowledge(
      'IDP-REQ-0001',
      { action: 'accepted' },
      'user-dean',
    );

    await expect(
      service.acknowledge(
        'IDP-REQ-0001',
        { action: 'rejected', notes: 'Changed my mind' },
        'user-dean',
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'duplicate_key' } },
      status: 409,
    });
    expect(outboxRepo.rows).toHaveLength(1);
  });

  it('pushes the ack when Pattern A is configured', async () => {
    client.enabled = true;
    await service.receive(changeRequest());

    const result = await service.acknowledge(
      'IDP-REQ-0001',
      { action: 'accepted', notes: 'Applied.' },
      'user-dean',
    );

    expect(result).toMatchObject({
      queued: true,
      attempted: true,
      delivered: true,
      status: 202,
      attempts: 1,
    });
    expect(client.pushChangeRequestAck).toHaveBeenCalledWith(
      'IDP-REQ-0001',
      expect.objectContaining({
        idp_request_id: 'IDP-REQ-0001',
        action: 'accepted',
      }),
    );
  });

  it('keeps the ack queued when the Pattern A push fails', async () => {
    client.enabled = true;
    client.pushChangeRequestAck.mockRejectedValue(
      new IdpUpstreamError(503, 'internal_error', 'IDP is down', 5),
    );
    await service.receive(changeRequest());

    const result = await service.acknowledge(
      'IDP-REQ-0001',
      { action: 'modified', notes: 'Applied with a room change.' },
      'user-dean',
    );

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

  it('lists change requests filtered by status, newest first', async () => {
    await service.receive(changeRequest());
    await service.receive(
      changeRequest({
        idp_request_id: 'IDP-REQ-0002',
        type: 'qualification_add',
        details: { subject_code: 'CPE 131' },
        created_at: '2026-10-24T09:40:00Z',
      }),
    );

    const result = await service.list({ status: 'pending', limit: 10 });

    expect(result.items.map((item) => item.idp_request_id)).toEqual([
      'IDP-REQ-0002',
      'IDP-REQ-0001',
    ]);
    expect(result.items[0]).toMatchObject({
      type: 'qualification_add',
      status: 'pending',
      requires_ack: true,
      details: { subject_code: 'CPE 131' },
      ack: null,
    });
  });
});
