import 'reflect-metadata';

import { strict as assert } from 'node:assert';
import { SchedulePublishService } from '../src/modules/scheduling/services/schedule-publish.service';
import { createFakeRepository } from './fakes/repository.fake';
import {
  deanProfile,
  departmentHeadProfile,
  otherDepartmentHeadProfile,
} from './helpers/profiles';

const schedule = {
  scheduleId: 's1',
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
  let service: SchedulePublishService;

  beforeEach(() => {
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

    service = new SchedulePublishService(
      requestRepo as any,
      scheduleRepo as any,
      scheduleFaculty as any,
      departments as any,
      dispatcher as any,
      recipients as any,
      supabase as any,
    );
  });

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
});
