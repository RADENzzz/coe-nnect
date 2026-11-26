import 'reflect-metadata';

import { strict as assert } from 'node:assert';
import { Logger } from '@nestjs/common';
import { Term } from '../src/modules/terms/entities/term.entity';
import { Schedule } from '../src/modules/scheduling/entities/schedule.entity';
import { SchedulePublishRequest } from '../src/modules/scheduling/entities/schedule-publish-request.entity';
import { ScheduleChangeRequest } from '../src/modules/scheduling/entities/schedule-change-request.entity';
import { ScheduleUnfinalizeRequest } from '../src/modules/scheduling/entities/schedule-unfinalize-request.entity';
import { TermLifecycleService } from '../src/modules/scheduling/services/term-lifecycle.service';
import { createFakeRepository } from './fakes/repository.fake';
import { deanProfile } from './helpers/profiles';

type Repo = ReturnType<typeof createFakeRepository>;

function buildService() {
  const termRepo = createFakeRepository([], { idKey: 'termId' });
  const scheduleRepo = createFakeRepository([], { idKey: 'scheduleId' });
  const publishRepo = createFakeRepository([], { idKey: 'requestId' });
  const changeRepo = createFakeRepository([], { idKey: 'requestId' });
  const unfinalizeRepo = createFakeRepository([], { idKey: 'requestId' });

  const versions = {
    writeTerm: jest.fn(
      async (
        _termId: string,
        _actor: any,
        _reason: string,
        _manager?: unknown,
      ) => ({}),
    ),
    restoreTerm: jest.fn(async (_termId: string, _manager?: unknown) => ({
      restored: 0,
      skipped: 0,
      reassignedIds: [] as string[],
    })),
    clearTerm: jest.fn(async (termId: string) => {
      const before = scheduleRepo.rows.length;
      for (let index = scheduleRepo.rows.length - 1; index >= 0; index -= 1) {
        if (String(scheduleRepo.rows[index].termId) === String(termId)) {
          scheduleRepo.rows.splice(index, 1);
        }
      }
      return before - scheduleRepo.rows.length;
    }),
    findBySemester: jest.fn(async (_semester?: string) => [] as any[]),
  };

  let facultyCount = 0;
  let facultyRows: Array<{ request_id: string }> = [];
  let selectedFacultyRows = false;
  let restoreError: Error | null = null;
  const supabaseFacultyUpdate = jest.fn(
    (_table: string, _payload: Record<string, unknown>) => facultyQuery,
  );
  const facultyQuery: any = {
    select: jest.fn((_columns?: string, options?: { head?: boolean }) => {
      if (!options?.head) selectedFacultyRows = true;
      return facultyQuery;
    }),
    update: jest.fn((payload: Record<string, unknown>) => {
      if (payload.status === 'pending' && restoreError) throw restoreError;
      supabaseFacultyUpdate('faculty_request', payload);
      return facultyQuery;
    }),
    eq: jest.fn(() => facultyQuery),
    in: jest.fn((_column: string, _values: string[]) => facultyQuery),
    then: (resolve: any, reject: any) => {
      const data = selectedFacultyRows ? [...facultyRows] : null;
      selectedFacultyRows = false;
      return Promise.resolve({ data, count: facultyCount, error: null }).then(
        resolve,
        reject,
      );
    },
  };
  const supabase = {
    getAdminClient: () => ({
      from: jest.fn((table: string) => {
        assert.equal(table, 'faculty_request');
        return facultyQuery;
      }),
    }),
  };

  const repos = new Map<any, Repo>([
    [Term, termRepo],
    [Schedule, scheduleRepo],
    [SchedulePublishRequest, publishRepo],
    [ScheduleChangeRequest, changeRepo],
    [ScheduleUnfinalizeRequest, unfinalizeRepo],
  ]);
  const manager = {
    getRepository: jest.fn((entity: any) => repos.get(entity)),
    createQueryBuilder: jest.fn(() => {
      let values: Record<string, unknown> = {};
      let params: Record<string, unknown> = {};
      const builder: any = {
        update: jest.fn(() => builder),
        set: jest.fn((next: Record<string, unknown>) => {
          values = next;
          return builder;
        }),
        where: jest.fn((_clause: string, next: Record<string, unknown>) => {
          params = next;
          return builder;
        }),
        execute: jest.fn(async () => {
          let affected = 0;
          for (const row of termRepo.rows) {
            const matches =
              params.active !== undefined
                ? Boolean(row.isActive) === Boolean(params.active)
                : String(row.termId) === String(params.id);
            if (matches) {
              Object.assign(row, values);
              affected += 1;
            }
          }
          return { affected };
        }),
      };
      return builder;
    }),
  };
  const dataSource = {
    transaction: jest.fn(async (work: (manager: any) => Promise<unknown>) =>
      work(manager),
    ),
  };

  return {
    service: new TermLifecycleService(
      termRepo as any,
      scheduleRepo as any,
      publishRepo as any,
      changeRepo as any,
      unfinalizeRepo as any,
      dataSource as any,
      versions as any,
      supabase as any,
    ),
    termRepo,
    scheduleRepo,
    publishRepo,
    changeRepo,
    unfinalizeRepo,
    versions,
    manager,
    facultyQuery,
    supabaseFacultyUpdate,
    setFacultyCount: (count: number) => {
      facultyCount = count;
    },
    setFacultyRows: (rows: Array<{ request_id: string }>) => {
      facultyRows = rows;
    },
    setRestoreError: (error: Error | null) => {
      restoreError = error;
    },
  };
}

describe('TermLifecycleService', () => {
  let env: ReturnType<typeof buildService>;

  beforeEach(() => {
    env = buildService();
  });

  function seedTerm(termId: string, isActive = false) {
    env.termRepo.rows.push({
      termId,
      termName: termId === '1' ? 'First Term' : 'Second Term',
      semester: '1st',
      schoolYear: '2026-2027',
      isActive,
      startDate: null,
      endDate: null,
    });
  }

  function seedSchedules(
    counts: Record<string, number>,
    termId = '1',
  ) {
    let index = 0;
    for (const [status, count] of Object.entries(counts)) {
      for (let iteration = 0; iteration < count; iteration += 1) {
        index += 1;
        env.scheduleRepo.rows.push({
          scheduleId: `s-${termId}-${index}`,
          termId,
          subjectId: String(index),
          status,
          deptId: '1',
        });
      }
    }
  }

  function seedPendingRequests(
    counts: {
      publish: number;
      change: number;
      unfinalize: number;
      faculty: number;
    },
    termId = '1',
  ) {
    const row = env.scheduleRepo.rows.find(
      (candidate) => String(candidate.termId) === String(termId),
    );
    const scheduleId = row?.scheduleId ?? `s-${termId}-missing`;
    const byKind = {
      publish: env.publishRepo,
      change: env.changeRepo,
      unfinalize: env.unfinalizeRepo,
    };
    for (const kind of ['publish', 'change', 'unfinalize'] as const) {
      for (let index = 0; index < counts[kind]; index += 1) {
        byKind[kind].rows.push({
          requestId: `${kind}-${termId}-${index}`,
          scheduleId,
          status: 'pending',
          responseRemarks: null,
        });
      }
    }
    env.setFacultyCount(counts.faculty);
    env.setFacultyRows(
      Array.from({ length: counts.faculty }, (_, index) => ({
        request_id: `fac-${termId}-${index}`,
      })),
    );
  }

  function seedSavedVersion(termId = '1') {
    env.versions.findBySemester.mockResolvedValue([
      {
        versionId: `v-${termId}`,
        termId,
        termName: termId === '1' ? 'First Term' : 'Second Term',
        semester: '1st',
        schoolYear: '2026-2027',
        entryCount: 4,
        stale: false,
        locked: true,
        publishedAt: null,
        deactivatedAt: null,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
  }

  it('summarizes draft counts and pending requests before deactivation', async () => {
    seedTerm('1');
    seedSchedules({ draft: 2, review: 1, finalized: 1, published: 3 });
    seedPendingRequests({ publish: 1, change: 1, unfinalize: 0, faculty: 2 });
    seedSavedVersion();

    const summary = await env.service.summary('1', 'deactivate');

    assert.deepEqual(summary.statusCounts, {
      draft: 2,
      review: 1,
      finalized: 1,
      published: 3,
    });
    assert.deepEqual(summary.pendingRequests, {
      publish: 1,
      change: 1,
      unfinalize: 0,
      faculty: 2,
    });
    assert.equal(summary.termId, '1');
    assert.equal(summary.termName, 'First Term');
    assert.equal(summary.savedVersion?.versionId, 'v-1');
    assert.equal(summary.otherTerm, null);
  });

  it('saves all rows and closes pending requests before clearing the grid', async () => {
    seedTerm('1');
    seedSchedules({ draft: 1, review: 1, finalized: 1, published: 1 });
    seedPendingRequests({ publish: 1, change: 1, unfinalize: 1, faculty: 2 });

    await env.service.deactivate('1', deanProfile);

    assert.equal(env.versions.writeTerm.mock.calls[0][2], 'deactivated');
    assert.equal(env.versions.clearTerm.mock.calls[0][0], '1');
    assert.equal(
      env.versions.writeTerm.mock.invocationCallOrder[0] <
        env.versions.clearTerm.mock.invocationCallOrder[0],
      true,
    );
    assert.match(
      (env.publishRepo.rows[0] as any).responseRemarks,
      /term deactivated/i,
    );
    assert.equal(env.supabaseFacultyUpdate.mock.calls[0][1].status, 'cancelled');
    assert.equal(env.versions.writeTerm.mock.calls[0][3], env.manager);
    assert.equal(
      env.scheduleRepo.rows.filter((row) => String(row.termId) === '1').length,
      0,
    );
    assert.equal(
      env.termRepo.rows.find((row) => String(row.termId) === '1')?.isActive,
      false,
    );
    for (const repo of [env.publishRepo, env.changeRepo, env.unfinalizeRepo]) {
      assert.equal(repo.rows[0].status, 'cancelled');
      assert.match(repo.rows[0].responseRemarks, /First Term/);
    }
    expect(env.facultyQuery.eq).toHaveBeenNthCalledWith(1, 'term_id', '1');
    expect(env.facultyQuery.eq).toHaveBeenNthCalledWith(2, 'status', 'pending');
    expect(env.facultyQuery.in).not.toHaveBeenCalled();
    expect(env.supabaseFacultyUpdate).toHaveBeenCalledTimes(1);
  });

  it('saves and clears the previously active term, then restores the target on activation', async () => {
    seedTerm('1');
    seedTerm('2', true);
    seedSchedules({ draft: 2 }, '2');
    seedPendingRequests(
      { publish: 0, change: 1, unfinalize: 0, faculty: 1 },
      '2',
    );
    seedSavedVersion('1');

    await env.service.activate('1', deanProfile);

    assert.equal(env.versions.writeTerm.mock.calls[0][0], '2');
    assert.equal(env.versions.clearTerm.mock.calls[0][0], '2');
    assert.equal(env.versions.restoreTerm.mock.calls[0][0], '1');
    assert.equal(
      env.versions.writeTerm.mock.invocationCallOrder[0] <
        env.versions.restoreTerm.mock.invocationCallOrder[0],
      true,
    );
    assert.equal(
      env.termRepo.rows.find((row) => row.termId === '2')?.isActive,
      false,
    );
    assert.equal(
      env.termRepo.rows.find((row) => row.termId === '1')?.isActive,
      true,
    );
    assert.equal(env.versions.restoreTerm.mock.calls[0][1], env.manager);
  });

  it('does not re-restore a term that is already active', async () => {
    seedTerm('1', true);
    seedSchedules({ draft: 1 });
    seedSavedVersion('1');

    await env.service.activate('1', deanProfile);

    assert.equal(env.versions.writeTerm.mock.calls.length, 0);
    assert.equal(env.versions.clearTerm.mock.calls.length, 0);
    assert.equal(env.versions.restoreTerm.mock.calls.length, 0);
    assert.equal(env.scheduleRepo.rows.length, 1);
  });

  it('includes the active term being swapped out in the activation summary', async () => {
    seedTerm('1');
    seedTerm('2', true);
    seedSchedules({ draft: 3, published: 1 }, '2');
    seedPendingRequests(
      { publish: 0, change: 0, unfinalize: 1, faculty: 0 },
      '2',
    );
    seedSavedVersion('1');

    const summary = await env.service.summary('1', 'activate');

    assert.deepEqual(summary.statusCounts, {
      draft: 0,
      review: 0,
      finalized: 0,
      published: 0,
    });
    assert.deepEqual(summary.otherTerm, {
      termId: '2',
      termName: 'Second Term',
      statusCounts: { draft: 3, review: 0, finalized: 0, published: 1 },
    });
    assert.equal(summary.savedVersion?.versionId, 'v-1');
  });

  it('restores cancelled faculty requests and rethrows the original error when clearing the grid fails', async () => {
    seedTerm('1');
    seedSchedules({ draft: 1 });
    seedPendingRequests({ publish: 0, change: 0, unfinalize: 0, faculty: 2 });
    const failure = new Error('clear failed');
    env.versions.clearTerm.mockRejectedValueOnce(failure);

    await assert.rejects(
      () => env.service.deactivate('1', deanProfile),
      (error: unknown) => error === failure,
    );

    expect(env.supabaseFacultyUpdate.mock.calls[0][1].status).toBe('cancelled');
    expect(env.supabaseFacultyUpdate.mock.calls[1][1]).toEqual({
      status: 'pending',
      responded_by: null,
      responded_at: null,
      response_remarks: null,
    });
    expect(env.facultyQuery.in).toHaveBeenCalledWith('request_id', [
      'fac-1-0',
      'fac-1-1',
    ]);
  });

  it('restores the swapped-out term faculty requests when activation fails after cancellation', async () => {
    seedTerm('1');
    seedTerm('2', true);
    seedSchedules({ draft: 1 }, '2');
    seedPendingRequests(
      { publish: 0, change: 0, unfinalize: 0, faculty: 1 },
      '2',
    );
    seedSavedVersion('1');
    const failure = new Error('restore failed');
    env.versions.restoreTerm.mockRejectedValueOnce(failure);

    await assert.rejects(
      () => env.service.activate('1', deanProfile),
      (error: unknown) => error === failure,
    );

    expect(env.facultyQuery.eq).toHaveBeenNthCalledWith(1, 'term_id', '2');
    expect(env.supabaseFacultyUpdate.mock.calls[1][1]).toEqual({
      status: 'pending',
      responded_by: null,
      responded_at: null,
      response_remarks: null,
    });
    expect(env.facultyQuery.in).toHaveBeenCalledWith('request_id', ['fac-2-0']);
  });

  it('logs a failed compensation without replacing the original error', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    try {
      seedTerm('1');
      seedSchedules({ draft: 1 });
      seedPendingRequests({ publish: 0, change: 0, unfinalize: 0, faculty: 1 });
      const failure = new Error('clear failed');
      const compensationFailure = new Error('supabase down');
      env.versions.clearTerm.mockRejectedValueOnce(failure);
      env.setRestoreError(compensationFailure);

      await assert.rejects(
        () => env.service.deactivate('1', deanProfile),
        (error: unknown) => error === failure,
      );

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('supabase down'));
      expect(env.facultyQuery.in).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
