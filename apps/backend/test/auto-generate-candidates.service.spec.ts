import { AutoGenerateService } from '../src/modules/scheduling/services/auto-generate.service';

describe('AutoGenerateService candidate mode', () => {
  const termId = '10';
  const deptId = '20';
  const userId = 'user-1';

  function makeRpc(overrides: Record<string, any> = {}) {
    return jest.fn(async (fn: string, _args?: any) => {
      if (overrides[fn]) return overrides[fn](fn, _args);
      if (fn === 'try_acquire_auto_generate_lock') return { data: true, error: null };
      if (fn === 'release_auto_generate_lock') return { data: true, error: null };
      if (fn === 'mark_auto_generate_pending') return { data: true, error: null };
      if (fn === 'get_auto_generate_lock') return { data: [], error: null };
      return { data: null, error: null };
    });
  }

  function makeFrom() {
    const calls: any[] = [];
    const builder: any = {
      calls,
      select: jest.fn(() => builder),
      insert: jest.fn(() => builder),
      delete: jest.fn(() => builder),
      eq: jest.fn(() => builder),
      neq: jest.fn(() => builder),
      in: jest.fn(() => builder),
      like: jest.fn(() => builder),
      or: jest.fn(() => builder),
      maybeSingle: jest.fn(async () => ({ data: null, error: null })),
      single: jest.fn(async () => ({ data: null, error: null })),
      then: undefined,
    };
    // Make awaitable for queries that return {data,error}
    builder[Symbol.toStringTag] = 'Promise';
    builder.then = (resolve: any, reject: any) =>
      Promise.resolve({ data: [], error: null, count: 0 }).then(resolve, reject);
    return builder;
  }

  function makeSupabase(rpc = makeRpc()) {
    const fromBuilders: Record<string, any> = {};
    const from = jest.fn((table: string) => {
      if (!fromBuilders[table]) fromBuilders[table] = makeFrom();
      return fromBuilders[table];
    });
    const db = { from, rpc };
    return {
      getAdminClient: jest.fn(() => db),
      db,
      fromBuilders,
    };
  }

  function makeService(overrides: Record<string, any> = {}) {
    const rpc = overrides.rpc ?? makeRpc();
    const supabase = overrides.supabase ?? makeSupabase(rpc);
    const solverClient = overrides.solverClient ?? {
      solve: jest.fn().mockResolvedValue({
        status: 'success',
        candidates: [
          {
            schedule: [
              {
                sectionId: 'sec-1',
                subjectId: 'sub-1',
                facultyId: 'fac-1',
                roomId: 'room-1',
                day: 'Monday',
                startTime: '08:00',
                endTime: '09:00',
                loadType: 'lecture',
              },
            ],
            unscheduled: [],
            objectiveValue: 1,
            solveTimeSeconds: 0.1,
          },
        ],
        solveTimeSeconds: 0.1,
      }),
    };
    const constraints = overrides.constraints ?? {
      evaluate: jest.fn().mockReturnValue({ valid: true, hardConflicts: [], softWarnings: [] }),
    };
    const ruleContextBuilder = overrides.ruleContextBuilder ?? {
      build: jest.fn().mockResolvedValue({}),
    };
    const coverage = overrides.coverage ?? {
      findUnplottedMinors: jest.fn().mockResolvedValue([]),
    };
    const dispatcher = overrides.dispatcher ?? {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };
    const recipients = overrides.recipients ?? {
      departmentHeadsOf: jest.fn().mockResolvedValue(['dh-1']),
      administrators: jest.fn().mockResolvedValue([]),
      collegeDean: jest.fn().mockResolvedValue([]),
      uniq: jest.fn((arr: string[]) => Array.from(new Set(arr))),
    };
    const departments = overrides.departments ?? {
      assertDepartmentActive: jest.fn().mockResolvedValue(undefined),
    };

    const service = new AutoGenerateService(
      supabase as any,
      solverClient as any,
      constraints as any,
      ruleContextBuilder as any,
      coverage as any,
      dispatcher as any,
      recipients as any,
      departments as any,
    );

    // Avoid full problem building complexity by stubbing the private method.
    jest.spyOn(service as any, 'buildSolverProblem').mockResolvedValue({
      termId,
      deptId,
      sections: [],
      subjects: [],
      prospectus: [],
      faculty: [],
      qualifications: [],
      preferences: [],
      rooms: [],
      roomPreferences: [],
      timeSlots: [],
      config: {},
      existingSchedule: [],
      existingSubjectLoadCounts: [],
      unavailability: [],
    });
    jest.spyOn(service as any, 'analyzeRoomSufficiency').mockReturnValue({
      sufficient: true,
      deficits: [],
      hint: '',
    });
    if (typeof (service as any).getOwnAutoDraftScheduleRows === 'function') {
      jest.spyOn(service as any, 'getOwnAutoDraftScheduleRows').mockResolvedValue([
        {
          schedule_id: 'draft-1',
          section_id: 'sec-1',
          subject_id: 'sub-1',
          load_type: 'lecture',
          day_of_week: 'Monday',
          start_time: '07:00',
          end_time: '08:00',
          room_id: 'room-1',
          faculty_id: 'fac-1',
          section: 'A',
        },
      ]);
    }
    if (typeof (service as any).getOwnAutoDraftUnscheduledRows === 'function') {
      jest.spyOn(service as any, 'getOwnAutoDraftUnscheduledRows').mockResolvedValue([]);
    }

    return {
      service,
      supabase,
      solverClient,
      constraints,
      ruleContextBuilder,
      coverage,
      dispatcher,
      recipients,
      departments,
      rpc,
    };
  }

  it('does not delete or insert schedule rows in candidate mode', async () => {
    const { service, supabase } = makeService();

    await service.autoGenerate(termId, deptId, userId, { candidateCount: 2 } as any);

    const scheduleFrom = supabase.db.from.mock.calls
      .filter(([table]: [string]) => table === 'schedule')
      .map(([table]: [string]) => supabase.fromBuilders[table]);

    const anyDelete = scheduleFrom.some((b: any) =>
      b?.delete?.mock?.calls?.length > 0,
    );
    const anyInsert = scheduleFrom.some((b: any) =>
      b?.insert?.mock?.calls?.length > 0,
    );

    expect(anyDelete).toBe(false);
    expect(anyInsert).toBe(false);
  });

  it('acquires the db lock inside runSerially and releases it on success', async () => {
    const events: string[] = [];
    const rpc = jest.fn(async (fn: string) => {
      if (fn === 'try_acquire_auto_generate_lock') {
        events.push('acquire');
        return { data: true, error: null };
      }
      if (fn === 'release_auto_generate_lock') {
        events.push('release');
        return { data: true, error: null };
      }
      if (fn === 'mark_auto_generate_pending') return { data: true, error: null };
      return { data: null, error: null };
    });
    const supabase = makeSupabase(rpc);
    const { service } = makeService({ supabase, rpc });

    const originalRunSerially = (service as any).runSerially.bind(service);
    jest.spyOn(service as any, 'runSerially').mockImplementation(async (_term: string, task: () => Promise<any>) => {
      events.push('runSerially:start');
      const result = await originalRunSerially(_term, async () => {
        events.push('task:start');
        const r = await task();
        events.push('task:end');
        return r;
      });
      events.push('runSerially:end');
      return result;
    });

    await service.autoGenerate(termId, deptId, userId, { candidateCount: 3 } as any);

    expect(events).toContain('acquire');
    expect(events.indexOf('task:start')).toBeLessThan(events.indexOf('acquire'));
    expect(events.indexOf('acquire')).toBeLessThan(events.indexOf('task:end'));
    expect(events).toContain('release');
  });

  it('does not mark pending_confirm in candidate mode', async () => {
    const rpc = makeRpc();
    const supabase = makeSupabase(rpc);
    const { service } = makeService({ supabase, rpc });

    await service.autoGenerate(termId, deptId, userId, { candidateCount: 2 } as any);

    const pendingCalls = rpc.mock.calls.filter(([fn]: [string]) => fn === 'mark_auto_generate_pending');
    expect(pendingCalls).toHaveLength(0);
  });

  it('returns a token and currentAutoDraftCount with candidates', async () => {
    const { service } = makeService();

    const result = await service.autoGenerate(termId, deptId, userId, { candidateCount: 2 } as any);

    expect(result.mode).toBe('candidates');
    expect(Array.isArray(result.candidates)).toBe(true);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(typeof result.generationToken).toBe('string');
    expect(result.generationToken.length).toBeGreaterThan(0);
    expect(result.currentAutoDraftCount).toBe(1);
  });

  it('sends candidate notifications only to the initiating user', async () => {
    const { service, dispatcher, recipients } = makeService();

    await service.autoGenerate(termId, deptId, userId, { candidateCount: 2 } as any);

    const startedCalls = dispatcher.dispatch.mock.calls.filter(
      ([event]: [string]) => event === 'auto_generate.started',
    );
    expect(startedCalls).toHaveLength(1);
    expect(startedCalls[0][1].recipientUserIds).toEqual([userId]);
    expect(recipients.departmentHeadsOf).not.toHaveBeenCalled();

    const finishedCalls = dispatcher.dispatch.mock.calls.filter(
      ([event]: [string]) => event === 'auto_generate.finished',
    );
    expect(finishedCalls).toHaveLength(1);
    expect(finishedCalls[0][1].recipientUserIds).toEqual([userId]);
    expect(finishedCalls[0][1].payload.candidateCount).toBe(1);
    expect(finishedCalls[0][1].payload.scheduleCount).toBeUndefined();
  });

  it('fails cleanly when in-flight validation exceeds the 60s budget', async () => {
    jest.useFakeTimers();
    const realDateNow = Date.now;
    const base = 1_000_000;
    let dateNowCalls = 0;
    Date.now = jest.fn(() => {
      dateNowCalls += 1;
      return dateNowCalls === 1 ? base : base + 59_999;
    }) as any;

    try {
      const { service, supabase } = makeService();
      let validationCalled!: () => void;
      const validationCalledPromise = new Promise<void>((resolve) => {
        validationCalled = resolve;
      });
      jest
        .spyOn(service as any, 'validateGeneratedSchedule')
        .mockImplementation(() => {
          validationCalled();
          return new Promise(() => {});
        });

      dateNowCalls = 0;
      const resultPromise = service.autoGenerate(termId, deptId, userId, {
        candidateCount: 2,
      } as any);
      await validationCalledPromise;
      await jest.advanceTimersByTimeAsync(60_005);
      const result: any = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/validation took too long/i);
      expect(result.candidates).toBeUndefined();

      const scheduleFrom = supabase.db.from.mock.calls
        .filter(([table]: [string]) => table === 'schedule')
        .map(([table]: [string]) => supabase.fromBuilders[table]);
      expect(scheduleFrom.some((b: any) => b?.delete?.mock?.calls?.length > 0)).toBe(false);
      expect(scheduleFrom.some((b: any) => b?.insert?.mock?.calls?.length > 0)).toBe(false);
    } finally {
      Date.now = realDateNow;
      jest.useRealTimers();
    }
  });
});
