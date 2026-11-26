import 'reflect-metadata';

import { strict as assert } from 'node:assert';
import { SchedulePublishService } from '../src/modules/scheduling/services/schedule-publish.service';
import { Schedule } from '../src/modules/scheduling/entities/schedule.entity';
import { SchedulePublishRequest } from '../src/modules/scheduling/entities/schedule-publish-request.entity';
import { createFakeRepository } from './fakes/repository.fake';
import {
  deanProfile,
  departmentHeadProfile,
  otherDepartmentHeadProfile,
} from './helpers/profiles';

const schedule = {
  scheduleId: 's1',
  termId: '1',
  deptId: '1',
  status: 'finalized',
  subjectId: '16',
  subject: { subjectCode: 'CS 101', title: 'Programming' },
  sectionRef: { sectionCode: 'CS-1A' },
  term: { termName: 'First Term' },
};

describe('SchedulePublishService', () => {
  let requestRepo: ReturnType<typeof createFakeRepository>;
  let scheduleRepo: ReturnType<typeof createFakeRepository>;
  let scheduleFaculty: { assertOwnership: jest.Mock };
  let dispatcher: { dispatch: jest.Mock };
  let writeTermMock: jest.Mock;
  let managedScheduleRepo: { update: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let service: SchedulePublishService;

  beforeEach(() => {
    schedule.status = 'finalized';
    requestRepo = createFakeRepository([], {
      idKey: 'requestId',
      autoId: true,
    });
    scheduleRepo = createFakeRepository([{ ...schedule }], {
      idKey: 'scheduleId',
    });
    scheduleFaculty = {
      assertOwnership: jest.fn(async (scheduleId: string) => {
        const found = await scheduleRepo.findOne({ where: { scheduleId } });
        if (!found) throw new Error('Schedule entry not found.');
        return found;
      }),
    };
    const departments = { assertDepartmentActive: jest.fn(async () => {}) };
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

    writeTermMock = jest.fn(async () => ({}));
    const termPublishedVersions = { writeTerm: writeTermMock };
    dataSource = {
      // Model a real transaction: manager writes are buffered and only reach
      // the fake repositories when the callback resolves; a rejection discards
      // them, leaving the persisted fake rows untouched.
      transaction: jest.fn(async (cb: (manager: any) => Promise<any>) => {
        const buffered: Array<() => Promise<unknown>> = [];
        const managedSchedule = {
          update: jest.fn(async (criteria: any, partial: any) => {
            buffered.push(() => scheduleRepo.update(criteria, partial));
            return { affected: 1 };
          }),
        };
        const managedRequests = {
          save: jest.fn(async (entity: any) => {
            buffered.push(() => requestRepo.save(entity));
            return entity;
          }),
        };
        managedScheduleRepo = managedSchedule;
        const manager = {
          getRepository: jest.fn((entity: any) => {
            if (entity === Schedule) return managedSchedule;
            if (entity === SchedulePublishRequest) return managedRequests;
            throw new Error('Unexpected repository');
          }),
        };
        const result = await cb(manager);
        for (const write of buffered) await write();
        return result;
      }),
    };

    service = new SchedulePublishService(
      requestRepo as any,
      scheduleRepo as any,
      scheduleFaculty as any,
      departments as any,
      dispatcher as any,
      recipients as any,
      supabase as any,
      termPublishedVersions as any,
      dataSource as any,
    );
  });

  function seedPendingRequest(overrides: Record<string, any> = {}) {
    requestRepo.rows.push({
      requestId: '1',
      scheduleId: 's1',
      status: 'pending',
      note: 'Please publish',
      requestedBy: departmentHeadProfile.userId,
      schedule:
        Object.keys(overrides).length === 0
          ? schedule
          : { ...schedule, ...overrides },
    });
  }

  function savedRequest() {
    return requestRepo.rows[0];
  }

  function transactionCalls() {
    return dataSource.transaction.mock.calls.length;
  }

  test('only a department head files a publish request', async () => {
    await assert.rejects(
      () => service.create('s1', {}, deanProfile),
      /Only department heads can request publication/,
    );
  });

  test('a publish request requires a finalized entry', async () => {
    scheduleRepo.findOne.mockResolvedValue({ ...schedule, status: 'draft' });
    await assert.rejects(
      () => service.create('s1', {}, departmentHeadProfile),
      /Only finalized entries can be submitted for publication/,
    );
  });

  test('create saves a trimmed optional note and one pending request', async () => {
    const saved = await service.create(
      's1',
      { note: '  ready for dean  ' },
      departmentHeadProfile,
    );
    assert.equal(saved.status, 'pending');
    assert.equal(saved.note, 'ready for dean');
    assert.equal(saved.scheduleId, 's1');
  });

  test('create rejects a second pending request for the same entry', async () => {
    requestRepo.rows.push({
      requestId: 'r1',
      scheduleId: 's1',
      status: 'pending',
    });
    await assert.rejects(
      () => service.create('s1', {}, departmentHeadProfile),
      /A publish request for this entry is already waiting for the Dean/,
    );
  });

  test('findForSchedule returns the pending request before older resolved ones', async () => {
    requestRepo.rows.push(
      {
        requestId: 'r-old',
        scheduleId: 's1',
        status: 'rejected',
        requestedBy: otherDepartmentHeadProfile.userId,
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
    const found = await service.findForSchedule('s1', departmentHeadProfile);
    assert.equal(found?.status, 'pending');
  });

  test('findRequests rejects an unknown status', async () => {
    await assert.rejects(
      () => service.findRequests({ status: 'waiting' }),
      /Unknown publish request status/,
    );
  });

  test('a notification dispatch failure does not fail create', async () => {
    dispatcher.dispatch.mockRejectedValueOnce(new Error('down'));
    const saved = await service.create('s1', {}, departmentHeadProfile);
    assert.equal(saved.status, 'pending');
  });

  test('create dispatches schedule.publish_requested with the request entity', async () => {
    await service.create('s1', { note: 'ready' }, departmentHeadProfile);
    const call = dispatcher.dispatch.mock.calls[0];
    assert.equal(call[0], 'schedule.publish_requested');
    assert.equal(call[1].entityType, 'schedule_publish_request');
    assert.equal(call[1].payload.note, 'ready');
  });

  test('respond rejects an already resolved request', async () => {
    seedPendingRequest();
    requestRepo.rows[0].status = 'approved';
    await assert.rejects(
      () => service.respond('1', { action: 'approve' }, deanProfile),
      /This publish request has already been resolved/,
    );
  });

  test('approve publishes the entry and records approved', async () => {
    seedPendingRequest();
    const saved = await service.respond('1', { action: 'approve' }, deanProfile);
    assert.equal(saved.status, 'approved');
    assert.equal(scheduleRepo.update.mock.calls[0][1].status, 'published');
  });

  test('reject requires remarks and drafts the entry', async () => {
    seedPendingRequest();
    await assert.rejects(
      () => service.respond('1', { action: 'reject', remarks: '   ' }, deanProfile),
      /Rejection remarks are required/,
    );
    const saved = await service.respond('1', { action: 'reject', remarks: 'Room conflict.' }, deanProfile);
    assert.equal(saved.status, 'rejected');
    assert.equal(saved.responseRemarks, 'Room conflict.');
    assert.equal(scheduleRepo.update.mock.calls[0][1].status, 'draft');
  });

  test('a stale approve request is cancelled without publishing', async () => {
    seedPendingRequest();
    schedule.status = 'draft';
    await assert.rejects(
      () => service.respond('1', { action: 'approve' }, deanProfile),
      /This entry is no longer finalized; the request was closed/,
    );
    assert.equal(requestRepo.rows[0].status, 'cancelled');
    assert.equal(scheduleRepo.update.mock.calls.length, 0);
  });

  test('a stale reject request is cancelled without drafting', async () => {
    seedPendingRequest();
    schedule.status = 'review';
    await assert.rejects(
      () => service.respond('1', { action: 'reject', remarks: 'Too late.' }, deanProfile),
      /This entry is no longer finalized; the request was closed/,
    );
    assert.equal(requestRepo.rows[0].status, 'cancelled');
    assert.equal(scheduleRepo.update.mock.calls.length, 0);
  });

  test('a decision notification failure does not fail respond', async () => {
    seedPendingRequest();
    dispatcher.dispatch.mockRejectedValueOnce(new Error('down'));
    const saved = await service.respond('1', { action: 'approve' }, deanProfile);
    assert.equal(saved.status, 'approved');
  });

  test('respond dispatches only the dedicated publish outcome trigger', async () => {
    seedPendingRequest();
    await service.respond('1', { action: 'reject', remarks: 'Retry next term.' }, deanProfile);
    const keys = Array.from(dispatcher.dispatch.mock.calls, (c) => c[0]);
    assert.deepEqual(keys, ['schedule.publish_rejected']);
  });

  test('cancelPendingForSchedule closes pending requests for that schedule only', async () => {
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
    assert.equal(
      requestRepo.rows[0].responseRemarks,
      'Schedule status changed outside this publish request.',
    );
    assert.equal(requestRepo.rows[0].respondedBy, deanProfile.userId);
  });

  it('refuses approval when the term is inactive, closes the request, and writes nothing', async () => {
    seedPendingRequest({ term: { termId: '1', isActive: false } });
    await assert.rejects(() => service.respond('1', { action: 'approve' }, deanProfile),
      /term is no longer active/i);
    assert.equal(scheduleRepo.update.mock.calls.length, 0);
    assert.equal(savedRequest().status, 'cancelled');
    assert.match(savedRequest().responseRemarks, /term is no longer active/i);
  });
  it('writes the saved version on approval inside the same transaction', async () => {
    seedPendingRequest();
    await service.respond('1', { action: 'approve', remarks: 'ok' }, deanProfile);
    assert.equal(transactionCalls(), 1);
    // Spread into a local array: jest's mock.calls arrays live in another realm
    // and strict assert.deepEqual compares their foreign Array prototype.
    assert.deepEqual(
      [...writeTermMock.mock.calls[0].slice(0, 3)],
      ['1', deanProfile, 'published'],
    );
    assert.equal(savedRequest().status, 'approved');
  });
  it('does not write a version on rejection', async () => {
    seedPendingRequest();
    await service.respond('1', { action: 'reject', remarks: 'no' }, deanProfile);
    assert.equal(writeTermMock.mock.calls.length, 0);
  });
  it('publishes in the transaction before writing the saved version', async () => {
    seedPendingRequest();
    let updatesAtWrite = -1;
    writeTermMock.mockImplementationOnce(async () => {
      updatesAtWrite = managedScheduleRepo.update.mock.calls.length;
      return {};
    });
    await service.respond('1', { action: 'approve' }, deanProfile);
    assert.equal(managedScheduleRepo.update.mock.calls.length, 1);
    assert.equal(managedScheduleRepo.update.mock.calls[0][1].status, 'published');
    assert.equal(updatesAtWrite, 1);
    assert.ok(
      writeTermMock.mock.invocationCallOrder[0] >
        managedScheduleRepo.update.mock.invocationCallOrder[0],
    );
  });
  it('rolls back the publish if the archive write fails', async () => {
    seedPendingRequest();
    writeTermMock.mockRejectedValue(new Error('archive down'));
    await assert.rejects(() => service.respond('1', { action: 'approve' }, deanProfile),
      /archive down/);
    assert.equal(scheduleRepo.rows[0].status, 'finalized');
    assert.equal(savedRequest().status, 'pending');
  });
});
