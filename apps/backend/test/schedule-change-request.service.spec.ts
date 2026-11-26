import 'reflect-metadata';

import { ForbiddenException } from '@nestjs/common';
import { strict as assert } from 'node:assert';
import { ScheduleChangeRequestService } from '../src/modules/scheduling/services/schedule-change-request.service';
import { TRIGGER_KEYS } from '../src/modules/notifications/triggers';
import { createFakeRepository } from './fakes/repository.fake';
import { deanProfile, departmentHeadProfile } from './helpers/profiles';

const schedule = {
  scheduleId: 's1',
  deptId: '1',
  status: 'review',
  subjectId: '16',
  subject: { subjectCode: 'CS 101', title: 'Programming' },
  sectionRef: { sectionCode: 'CS-1A' },
  term: { termName: 'First Term' },
};

const allowedStatuses = ['review', 'finalized'];
const disallowedStatuses = ['draft', 'published'];
const STALE_REMARK =
  'Schedule was no longer review or finalized when the request was reviewed.';
const CANCELLATION_REMARK =
  'Schedule status changed outside this change request.';

describe('ScheduleChangeRequestService', () => {
  let requestRepo: ReturnType<typeof createFakeRepository>;
  let scheduleRepo: ReturnType<typeof createFakeRepository>;
  let scheduleFaculty: { assertOwnership: jest.Mock };
  let departments: { assertDepartmentActive: jest.Mock };
  let dispatcher: { dispatch: jest.Mock };
  let schedulePublish: { cancelPendingForSchedule: jest.Mock };
  let service: ScheduleChangeRequestService;
  let forceInactive: boolean;

  beforeEach(() => {
    schedule.status = 'review';
    forceInactive = false;

    requestRepo = createFakeRepository([], {
      idKey: 'requestId',
      autoId: true,
    });
    scheduleRepo = createFakeRepository([{ ...schedule }], {
      idKey: 'scheduleId',
    });
    scheduleFaculty = {
      assertOwnership: jest.fn(async (scheduleId: string, user: any) => {
        const found = await scheduleRepo.findOne({ where: { scheduleId } });
        if (!found) throw new Error('Schedule entry not found.');
        if (
          user?.role === 'department_head' &&
          String(found.deptId) !== String(user.deptId)
        ) {
          throw new ForbiddenException(
            'You cannot edit schedules from other departments.',
          );
        }
        return found;
      }),
    };
    departments = {
      assertDepartmentActive: jest.fn(async () => {
        if (forceInactive) {
          throw new ForbiddenException('Department is inactive.');
        }
      }),
    };
    dispatcher = { dispatch: jest.fn(async () => {}) };
    const recipients = {
      collegeDean: jest.fn(async () => ['u-dean']),
      administrators: jest.fn(async () => ['u-admin']),
      departmentHeadsOfSchedule: jest.fn(async () => ['u-dh-1']),
      uniq: jest.fn((ids: string[]) => Array.from(new Set(ids))),
    };
    const supabase = {
      getAdminClient: jest.fn(() => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  dept_code: 'CPE',
                  dept_name: 'College of Engineering',
                },
              }),
            }),
          }),
        }),
      })),
    };
    schedulePublish = {
      cancelPendingForSchedule: jest.fn(async () => {}),
    };

    service = new ScheduleChangeRequestService(
      requestRepo as any,
      scheduleRepo as any,
      scheduleFaculty as any,
      departments as any,
      dispatcher as any,
      recipients as any,
      supabase as any,
      schedulePublish as any,
    );
  });

  function seedPendingRequest(overrides: Record<string, any> = {}) {
    const row = {
      requestId: 'r1',
      scheduleId: 's1',
      deptId: '1',
      status: 'pending',
      reason: 'Change the room assignment',
      requestedBy: departmentHeadProfile.userId,
      responseRemarks: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      schedule,
      ...overrides,
    };
    requestRepo.rows.push(row);
    return row;
  }

  it('lets a head file only for an owned review or finalized entry', async () => {
    for (const status of allowedStatuses) {
      requestRepo.rows.length = 0;
      scheduleFaculty.assertOwnership.mockClear();
      departments.assertDepartmentActive.mockClear();
      dispatcher.dispatch.mockClear();
      schedule.status = status;
      scheduleRepo.findOne.mockResolvedValue({ ...schedule, status });

      const saved = await service.create(
        's1',
        { reason: '  Needs a different room  ' },
        departmentHeadProfile,
      );

      assert.equal(saved.status, 'pending');
      assert.equal(saved.reason, 'Needs a different room');
      assert.equal(saved.scheduleId, 's1');
      assert.equal(saved.deptId, '1');
      assert.equal(saved.requestedBy, departmentHeadProfile.userId);
      assert.equal(scheduleFaculty.assertOwnership.mock.calls.length, 1);
      assert.equal(
        scheduleFaculty.assertOwnership.mock.calls[0][0],
        's1',
      );
      assert.equal(departments.assertDepartmentActive.mock.calls[0][0], '1');
      assert.equal(requestRepo.rows.length, 1);
    }
  });

  it('rejects filing on draft, published, foreign, inactive, or duplicate entries', async () => {
    await assert.rejects(
      () =>
        service.create(
          's1',
          { reason: 'Needs a different room' },
          deanProfile,
        ),
      /Only department heads can request a change/,
    );
    assert.equal(requestRepo.rows.length, 0);

    for (const status of disallowedStatuses) {
      schedule.status = status;
      scheduleRepo.findOne.mockResolvedValue({ ...schedule, status });
      await assert.rejects(
        () =>
          service.create(
            's1',
            { reason: 'Needs a different room' },
            departmentHeadProfile,
          ),
        /Only review or finalized entries can be submitted for a change/,
      );
    }

    schedule.status = 'review';
    scheduleRepo.findOne.mockResolvedValue({ ...schedule, deptId: '2' });
    await assert.rejects(
      () =>
        service.create(
          's1',
          { reason: 'Needs a different room' },
          departmentHeadProfile,
        ),
      /other departments/,
    );

    forceInactive = true;
    scheduleRepo.findOne.mockResolvedValue({ ...schedule });
    await assert.rejects(
      () =>
        service.create(
          's1',
          { reason: 'Needs a different room' },
          departmentHeadProfile,
        ),
      /Department is inactive/,
    );
    forceInactive = false;

    seedPendingRequest();
    await assert.rejects(
      () =>
        service.create(
          's1',
          { reason: 'Needs a different room' },
          departmentHeadProfile,
        ),
      /already waiting for the Dean/,
    );

    assert.equal(requestRepo.rows.length, 1);
    assert.equal(scheduleRepo.update.mock.calls.length, 0);
    assert.equal(dispatcher.dispatch.mock.calls.length, 0);
  });

  it('approves a pending request by moving the schedule to draft', async () => {
    seedPendingRequest();

    const saved = await service.respond(
      'r1',
      { action: 'approve' },
      deanProfile,
    );

    assert.equal(saved.status, 'approved');
    assert.equal(saved.respondedBy, deanProfile.userId);
    assert.ok(saved.respondedAt instanceof Date);
    assert.deepEqual(scheduleRepo.update.mock.calls[0][1], { status: 'draft' });
    assert.equal(schedule.status, 'draft');
  });

  it('rejects a pending request only with remarks and leaves the schedule unchanged', async () => {
    seedPendingRequest();

    await assert.rejects(
      () =>
        service.respond(
          'r1',
          { action: 'reject', remarks: '   ' },
          deanProfile,
        ),
      (error: any) => {
        assert.equal(error.message, 'Rejection remarks are required.');
        return true;
      },
    );
    assert.equal(requestRepo.rows[0].status, 'pending');
    assert.equal(scheduleRepo.update.mock.calls.length, 0);

    const saved = await service.respond(
      'r1',
      { action: 'reject', remarks: '  Try another room.  ' },
      deanProfile,
    );

    assert.equal(saved.status, 'rejected');
    assert.equal(saved.responseRemarks, 'Try another room.');
    assert.equal(saved.respondedBy, deanProfile.userId);
    assert.equal(scheduleRepo.update.mock.calls.length, 0);
    assert.equal(schedule.status, 'review');
  });

  it('cancels a stale request and throws without changing the schedule', async () => {
    for (const status of disallowedStatuses) {
      requestRepo.rows.length = 0;
      seedPendingRequest();
      schedule.status = status;

      await assert.rejects(
        () => service.respond('r1', { action: 'approve' }, deanProfile),
        /no longer review or finalized; the request was closed/,
      );

      assert.equal(requestRepo.rows[0].status, 'cancelled');
      assert.equal(requestRepo.rows[0].responseRemarks, STALE_REMARK);
      assert.equal(requestRepo.rows[0].respondedBy, deanProfile.userId);
      assert.ok(requestRepo.rows[0].respondedAt instanceof Date);
      assert.equal(scheduleRepo.update.mock.calls.length, 0);
      assert.equal(schedule.status, status);
      assert.equal(dispatcher.dispatch.mock.calls.length, 0);
    }
  });

  it('cancels the pending publish request when approving a finalized change request', async () => {
    seedPendingRequest();
    schedule.status = 'finalized';

    await service.respond('r1', { action: 'approve' }, deanProfile);

    assert.deepEqual(
      Array.from(schedulePublish.cancelPendingForSchedule.mock.calls[0]),
      ['s1', deanProfile.userId],
    );

    schedulePublish.cancelPendingForSchedule.mockClear();
    requestRepo.rows[0].status = 'pending';
    schedule.status = 'review';

    await service.respond('r1', { action: 'approve' }, deanProfile);

    assert.equal(schedulePublish.cancelPendingForSchedule.mock.calls.length, 0);
  });

  it('marks pending requests cancelled in cancelPendingForSchedule', async () => {
    requestRepo.rows.push(
      { requestId: 'r1', scheduleId: 's1', status: 'pending' },
      { requestId: 'r2', scheduleId: 's1', status: 'pending' },
      { requestId: 'r3', scheduleId: 's2', status: 'pending' },
    );

    await service.cancelPendingForSchedule('s1', deanProfile.userId);

    assert.deepEqual(
      requestRepo.rows.map((row) => row.status),
      ['cancelled', 'cancelled', 'pending'],
    );
    assert.equal(requestRepo.rows[0].responseRemarks, CANCELLATION_REMARK);
    assert.equal(requestRepo.rows[1].responseRemarks, CANCELLATION_REMARK);
    assert.equal(requestRepo.rows[0].respondedBy, deanProfile.userId);
    assert.ok(requestRepo.rows[0].respondedAt instanceof Date);
    assert.equal(requestRepo.rows[2].respondedBy, undefined);
  });

  it('dispatches change requested, approved, and rejected triggers with deep-link payloads', async () => {
    const created = await service.create(
      's1',
      { reason: '  Needs a different room  ' },
      departmentHeadProfile,
    );
    // The fake repository does not hydrate relations on save; TypeORM does.
    requestRepo.rows.find((row) => row.requestId === created.requestId)!.schedule =
      schedule;
    const requestedCall = dispatcher.dispatch.mock.calls[0];
    assert.equal(requestedCall[0], 'schedule.change_requested');
    assert.equal(requestedCall[1].entityType, 'schedule_change_request');
    assert.equal(requestedCall[1].entityId, created.requestId);
    for (const key of [
      'requestId',
      'scheduleId',
      'subjectId',
      'subjectCode',
      'subjectTitle',
      'sectionCode',
      'termName',
      'deptId',
      'reason',
      'previousStatus',
      'newStatus',
    ]) {
      assert.ok(key in requestedCall[1].payload, `missing payload key ${key}`);
    }
    assert.equal(requestedCall[1].payload.requestId, created.requestId);
    assert.equal(requestedCall[1].payload.scheduleId, 's1');
    assert.equal(requestedCall[1].payload.subjectId, '16');
    assert.equal(requestedCall[1].payload.subjectCode, 'CS 101');
    assert.equal(requestedCall[1].payload.subjectTitle, 'Programming');
    assert.equal(requestedCall[1].payload.sectionCode, 'CS-1A');
    assert.equal(requestedCall[1].payload.termName, 'First Term');
    assert.equal(requestedCall[1].payload.deptId, '1');
    assert.equal(requestedCall[1].payload.reason, 'Needs a different room');
    assert.equal(requestedCall[1].payload.previousStatus, 'review');
    assert.equal(requestedCall[1].payload.newStatus, 'review');

    const approved = await service.respond(
      created.requestId,
      { action: 'approve' },
      deanProfile,
    );
    const approveCall = dispatcher.dispatch.mock.calls[1];
    assert.equal(approveCall[0], 'schedule.change_approved');
    assert.equal(approveCall[1].entityType, 'schedule');
    assert.equal(approveCall[1].entityId, 's1');
    for (const key of [
      'requestId',
      'scheduleId',
      'subjectId',
      'subjectCode',
      'subjectTitle',
      'sectionCode',
      'termName',
      'deptId',
      'reason',
      'responseRemarks',
      'decidedByName',
      'previousStatus',
      'newStatus',
    ]) {
      assert.ok(key in approveCall[1].payload, `missing payload key ${key}`);
    }
    assert.equal(approveCall[1].payload.requestId, approved.requestId);
    assert.equal(approveCall[1].payload.reason, 'Needs a different room');
    assert.equal(approveCall[1].payload.decidedByName, deanProfile.username);
    assert.equal(approveCall[1].payload.previousStatus, 'review');
    assert.equal(approveCall[1].payload.newStatus, 'draft');

    schedule.status = 'review';
    const createdAgain = await service.create(
      's1',
      { reason: 'Move the lecture' },
      departmentHeadProfile,
    );
    requestRepo.rows
      .find((row) => row.requestId === createdAgain.requestId)!
      .schedule = schedule;
    const rejected = await service.respond(
      createdAgain.requestId,
      { action: 'reject', remarks: '  Try again next term.  ' },
      deanProfile,
    );
    const rejectCall = dispatcher.dispatch.mock.calls[3];
    assert.equal(rejectCall[0], 'schedule.change_rejected');
    assert.equal(rejectCall[1].entityType, 'schedule');
    assert.equal(rejectCall[1].entityId, 's1');
    for (const key of [
      'requestId',
      'scheduleId',
      'subjectId',
      'subjectCode',
      'subjectTitle',
      'sectionCode',
      'termName',
      'deptId',
      'reason',
      'responseRemarks',
      'decidedByName',
      'previousStatus',
      'newStatus',
    ]) {
      assert.ok(key in rejectCall[1].payload, `missing payload key ${key}`);
    }
    assert.equal(rejectCall[1].payload.requestId, rejected.requestId);
    assert.equal(rejectCall[1].payload.reason, 'Move the lecture');
    assert.equal(rejectCall[1].payload.responseRemarks, 'Try again next term.');
    assert.equal(rejectCall[1].payload.decidedByName, deanProfile.username);
    assert.equal(rejectCall[1].payload.previousStatus, 'review');
    assert.equal(rejectCall[1].payload.newStatus, 'review');

    assert.deepEqual(
      Array.from(dispatcher.dispatch.mock.calls, (call) => call[0]),
      [
        'schedule.change_requested',
        'schedule.change_approved',
        'schedule.change_requested',
        'schedule.change_rejected',
      ],
    );
  });

  it('validates the inbox status and filters by term through the schedule', async () => {
    await assert.rejects(
      () => service.findRequests({ status: 'waiting' }),
      /Unknown change request status/,
    );

    const builder: any = {};
    for (const method of [
      'leftJoinAndSelect',
      'andWhere',
      'orderBy',
      'take',
    ]) {
      builder[method] = jest.fn(() => builder);
    }
    builder.getMany = jest.fn(async () => [{ requestId: 'r1' }]);
    requestRepo.createQueryBuilder.mockReturnValue(builder);

    const results = await service.findRequests({
      status: 'pending',
      termId: 't1',
    });

    assert.equal(results.length, 1);
    assert.deepEqual(
      Array.from(builder.orderBy.mock.calls[0]),
      ['r.createdAt', 'DESC'],
    );
    assert.deepEqual(Array.from(builder.take.mock.calls[0]), [200]);
    assert.deepEqual(Array.from(builder.andWhere.mock.calls[0]), [
      'r.status = :status',
      { status: 'pending' },
    ]);
    assert.deepEqual(Array.from(builder.andWhere.mock.calls[1]), [
      's.term_id = :termId',
      { termId: 't1' },
    ]);
    assert.deepEqual(Array.from(builder.leftJoinAndSelect.mock.calls[0]), [
      'r.schedule',
      's',
    ]);
  });

  it('returns the latest request with dean and owning-head visibility', async () => {
    requestRepo.rows.push(
      {
        requestId: 'r-old',
        scheduleId: 's1',
        status: 'rejected',
        requestedBy: departmentHeadProfile.userId,
        createdAt: new Date('2026-01-02T00:00:00Z'),
      },
      {
        requestId: 'r-pending',
        scheduleId: 's1',
        status: 'pending',
        requestedBy: departmentHeadProfile.userId,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    );

    assert.equal(
      (await service.findForSchedule('s1', departmentHeadProfile))?.status,
      'pending',
    );
    assert.equal(
      (await service.findForSchedule('s1', deanProfile))?.status,
      'pending',
    );

    requestRepo.rows[1].status = 'cancelled';
    assert.equal(
      (await service.findForSchedule('s1', departmentHeadProfile))?.requestId,
      'r-old',
    );

    scheduleRepo.findOne.mockResolvedValue({ ...schedule, deptId: '2' });
    await assert.rejects(
      () => service.findForSchedule('s1', departmentHeadProfile),
      /other departments/,
    );
  });

  it('does not fail create or respond when notification dispatch fails', async () => {
    dispatcher.dispatch.mockRejectedValueOnce(new Error('down'));
    const created = await service.create(
      's1',
      { reason: 'Needs a different room' },
      departmentHeadProfile,
    );
    assert.equal(created.status, 'pending');
    requestRepo.rows.find((row) => row.requestId === created.requestId)!.schedule =
      schedule;

    dispatcher.dispatch.mockRejectedValueOnce(new Error('down'));
    const saved = await service.respond(
      created.requestId,
      { action: 'approve' },
      deanProfile,
    );
    assert.equal(saved.status, 'approved');
  });

  it('registers the change notification triggers', () => {
    for (const key of [
      'schedule.change_requested',
      'schedule.change_approved',
      'schedule.change_rejected',
    ]) {
      assert.ok(TRIGGER_KEYS.has(key), `missing trigger ${key}`);
    }
  });
});
