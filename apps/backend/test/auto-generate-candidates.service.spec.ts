import { AutoGenerateService } from '../src/modules/scheduling/services/auto-generate.service';

describe('AutoGenerateService candidate mode', () => {
  const termId = '10';
  const deptId = '20';
  const userId = 'user-1';

  const lockFunctions = new Set([
    'try_acquire_auto_generate_lock',
    'release_auto_generate_lock',
    'mark_auto_generate_pending',
    'get_auto_generate_lock',
  ]);

  function missingFunctionError(fn: string, byMessageOnly = false) {
    return {
      data: null,
      error: byMessageOnly
        ? {
            message: `Could not find the function public.${fn}(p_term_id, p_user_id) in the schema cache`,
          }
        : {
            code: 'PGRST202',
            message: `Could not find the function public.${fn}(p_term_id, p_user_id) in the schema cache`,
          },
    };
  }

  function rpcCalls(rpc: jest.Mock, fn: string) {
    return rpc.mock.calls.filter(([name]: [string]) => name === fn);
  }

  // Default RPC mock emulates CI's migrated schema: only term-scoped lock
  // signatures exist, so a dept-scoped payload gets PostgREST's PGRST202.
  function makeRpc(overrides: Record<string, any> = {}) {
    return jest.fn(async (fn: string, args?: any) => {
      if (overrides[fn]) return overrides[fn](fn, args);
      if (
        lockFunctions.has(fn) &&
        args &&
        Object.prototype.hasOwnProperty.call(args, 'p_dept_id')
      ) {
        return missingFunctionError(fn);
      }
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

  function makeSupabaseWithTableData(tableData: Record<string, any[]>) {
    const fromBuilders: Record<string, any> = {};
    const makeTableBuilder = (rows: any[]) => {
      const builder: any = {
        select: jest.fn(() => builder),
        insert: jest.fn(() => builder),
        delete: jest.fn(() => builder),
        eq: jest.fn(() => builder),
        neq: jest.fn(() => builder),
        in: jest.fn(() => builder),
        like: jest.fn(() => builder),
        or: jest.fn(() => builder),
        maybeSingle: jest.fn(async () => ({ data: rows[0] ?? null, error: null })),
        single: jest.fn(async () => ({ data: rows[0] ?? null, error: null })),
      };
      builder.then = (resolve: any, reject: any) =>
        Promise.resolve({ data: rows, error: null, count: rows.length }).then(
          resolve,
          reject,
        );
      return builder;
    };
    const rpc = makeRpc();
    const from = jest.fn((table: string) => {
      if (!fromBuilders[table]) {
        fromBuilders[table] = makeTableBuilder(tableData[table] ?? []);
      }
      return fromBuilders[table];
    });
    const db = { from, rpc };
    return {
      getAdminClient: jest.fn(() => db),
      db,
      fromBuilders,
    };
  }

  const solverProblemTableData = {
    program: [
      {
        program_id: 'prog-1',
        program_code: 'TEST',
        program_name: 'Test Program',
        dept_id: deptId,
      },
    ],
    section: [
      {
        section_id: 'sec-1',
        section_code: '1A',
        program_id: 'prog-1',
        year_level: 1,
      },
    ],
    term: [
      {
        term_id: termId,
        semester: '1st',
        term_name: 'Test Term',
      },
    ],
    prospectus: [
      {
        prospectus_id: 'pros-1',
        program_id: 'prog-1',
        subject_id: 'sub-1',
        year_level: 1,
        semester: '1st',
        lecture_sessions_per_week: 1,
        lecture_minutes_per_session: 90,
        lab_sessions_per_week: 1,
        lab_minutes_per_session: 120,
      },
    ],
    subject: [
      {
        subject_id: 'sub-1',
        subject_code: 'TEST 101',
        title: 'Test Subject',
        total_units: 4,
        lecture_units: 1,
        lab_units: 1,
        required_room_type: null,
        dept_id: deptId,
        source_dept: null,
        is_elective: false,
        is_placeholder: false,
      },
    ],
    faculty: [
      {
        faculty_id: 'fac-1',
        first_name: 'Test',
        last_name: 'Faculty',
        dept_id: deptId,
        classification: 'regular',
        required_hours: 18,
        designation_id: null,
      },
    ],
    faculty_qualification: [{ faculty_id: 'fac-1', subject_id: 'sub-1' }],
    faculty_unavailability: [],
    faculty_preference: [],
    room: [
      {
        room_id: 'room-1',
        room_number: 'R1',
        building: 'Test Hall',
        room_type: 'laboratory',
        capacity: 30,
        dept_id: deptId,
      },
    ],
    room_preference: [],
    schedule: [],
    scheduling_setting: [
      { setting_key: 'lecture_block_minutes', value: 60 },
      { setting_key: 'lab_split_hours', value: 3 },
    ],
  };

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
    if (!overrides.skipBuildSolverProblemStub) {
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
    }
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

  it('passes configured lecture block minutes to the solver instead of stale prospectus minutes', async () => {
    const { service } = makeService({
      supabase: makeSupabaseWithTableData(solverProblemTableData),
      skipBuildSolverProblemStub: true,
    });

    const problem = await (service as any).buildSolverProblem(termId, deptId);

    expect(problem.prospectus[0].lecture_minutes_per_session).toBe(60);
  });

  it('passes configured lab split minutes to the solver instead of stale prospectus minutes', async () => {
    const { service } = makeService({
      supabase: makeSupabaseWithTableData(solverProblemTableData),
      skipBuildSolverProblemStub: true,
    });

    const problem = await (service as any).buildSolverProblem(termId, deptId);

    expect(problem.prospectus[0].lab_minutes_per_session).toBe(180);
  });

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

  it('retries the term-scoped acquire signature when the dept-scoped RPC is missing', async () => {
    const { service, rpc } = makeService();

    const result = await service.autoGenerate(termId, deptId, userId, { candidateCount: 2 } as any);

    expect(result.success).toBe(true);
    const acquireCalls = rpcCalls(rpc, 'try_acquire_auto_generate_lock');
    expect(acquireCalls).toHaveLength(2);
    expect(acquireCalls[0][1]).toEqual({
      p_term_id: Number(termId),
      p_dept_id: Number(deptId),
      p_user_id: userId,
      p_ttl_seconds: 300,
    });
    expect(acquireCalls[1][1]).toEqual({
      p_term_id: Number(termId),
      p_user_id: userId,
      p_ttl_seconds: 300,
    });
  });

  it('retries the term-scoped release signature when the dept-scoped RPC is missing', async () => {
    const { service, rpc } = makeService();

    await service.autoGenerate(termId, deptId, userId, { candidateCount: 2 } as any);

    const releaseCalls = rpcCalls(rpc, 'release_auto_generate_lock');
    expect(releaseCalls).toHaveLength(2);
    expect(releaseCalls[0][1]).toEqual({
      p_term_id: Number(termId),
      p_dept_id: Number(deptId),
      p_user_id: userId,
    });
    expect(releaseCalls[1][1]).toEqual({
      p_term_id: Number(termId),
      p_user_id: userId,
    });
  });

  it('retries the term-scoped get-lock signature when the dept-scoped RPC is missing', async () => {
    const { service, rpc } = makeService();

    await service.autoGenerate(termId, deptId, userId, { candidateCount: 2 } as any);

    const getCalls = rpcCalls(rpc, 'get_auto_generate_lock');
    expect(getCalls).toHaveLength(2);
    expect(getCalls[0][1]).toEqual({
      p_term_id: Number(termId),
      p_dept_id: Number(deptId),
    });
    expect(getCalls[1][1]).toEqual({ p_term_id: Number(termId) });
  });

  it('retries the term-scoped pending signature when the dept-scoped RPC is missing', async () => {
    const { service, rpc } = makeService();

    await (service as any).markAutoGeneratePending(termId, deptId, userId);

    const pendingCalls = rpcCalls(rpc, 'mark_auto_generate_pending');
    expect(pendingCalls).toHaveLength(2);
    expect(pendingCalls[0][1]).toEqual({
      p_term_id: Number(termId),
      p_dept_id: Number(deptId),
      p_user_id: userId,
      p_ttl_seconds: 600,
    });
    expect(pendingCalls[1][1]).toEqual({
      p_term_id: Number(termId),
      p_user_id: userId,
      p_ttl_seconds: 600,
    });
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

  it('assigns unique UI candidate ids and count metadata to every generated candidate', async () => {
    const solverCandidates = [
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
      {
        schedule: [
          {
            sectionId: 'sec-2',
            subjectId: 'sub-2',
            facultyId: 'fac-2',
            roomId: 'room-2',
            day: 'Tuesday',
            startTime: '10:00',
            endTime: '11:00',
            loadType: 'lecture',
          },
          {
            sectionId: 'sec-3',
            subjectId: 'sub-3',
            facultyId: 'fac-3',
            roomId: 'room-3',
            day: 'Wednesday',
            startTime: '13:00',
            endTime: '14:00',
            loadType: 'lecture',
          },
        ],
        unscheduled: [
          {
            sectionId: 'sec-4',
            subjectId: 'sub-4',
            kind: 'lecture',
            sessionIndex: 0,
            sectionCode: 'A',
            subjectCode: 'SUB-4',
          },
        ],
        objectiveValue: 0.9,
        solveTimeSeconds: 0.2,
      },
    ];
    const solverClient = {
      solve: jest.fn().mockResolvedValue({
        status: 'success',
        candidates: solverCandidates,
        solveTimeSeconds: 0.3,
      }),
    };
    const { service } = makeService({ solverClient });

    const result = await service.autoGenerate(termId, deptId, userId, {
      candidateCount: 2,
    } as any);

    expect(result.candidates).toHaveLength(2);
    for (const candidate of result.candidates) {
      expect(typeof candidate.candidateId).toBe('string');
      expect(candidate.candidateId.length).toBeGreaterThan(0);
    }
    const ids = result.candidates.map((candidate: any) => candidate.candidateId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.candidates[0].placedCount).toBe(1);
    expect(result.candidates[0].unscheduledCount).toBe(0);
    expect(result.candidates[1].placedCount).toBe(2);
    expect(result.candidates[1].unscheduledCount).toBe(1);
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

  it('clears the in-memory guard when candidate started-notification setup fails before the critical section', async () => {
    const dispatcher = {
      dispatch: jest
        .fn()
        .mockRejectedValueOnce(new Error('started notification failed'))
        .mockResolvedValue(undefined),
    };
    const recipients = {
      departmentHeadsOf: jest.fn().mockResolvedValue(['dh-1']),
      administrators: jest.fn().mockResolvedValue([]),
      collegeDean: jest.fn().mockResolvedValue([]),
      uniq: jest.fn((arr: string[]) => Array.from(new Set(arr))),
    };
    const { service } = makeService({ dispatcher, recipients });
    const options = { candidateCount: 2 } as any;

    await expect(
      service.autoGenerate(termId, deptId, userId, options),
    ).rejects.toThrow('started notification failed');

    const result: any = await service.autoGenerate(
      termId,
      deptId,
      userId,
      options,
    );

    expect(result.success).toBe(true);
    expect(result.mode).toBe('candidates');
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it('clears the in-memory guard when department-head lookup fails before the critical section in legacy mode', async () => {
    const recipients = {
      departmentHeadsOf: jest
        .fn()
        .mockRejectedValueOnce(new Error('department head lookup failed'))
        .mockResolvedValue(['dh-1']),
      administrators: jest.fn().mockResolvedValue([]),
      collegeDean: jest.fn().mockResolvedValue([]),
      uniq: jest.fn((arr: string[]) => Array.from(new Set(arr))),
    };
    const solverClient = {
      solve: jest.fn().mockResolvedValue({
        status: 'success',
        schedule: [],
        unscheduled: [],
        solveTimeSeconds: 0.1,
      }),
    };
    const { service } = makeService({ recipients, solverClient });

    await expect(
      service.autoGenerate(termId, deptId, userId),
    ).rejects.toThrow('department head lookup failed');

    const result: any = await service.autoGenerate(termId, deptId, userId);

    expect(result.success).toBe(true);
  });

  it('uses only the dept-scoped acquire signature when that RPC is available', async () => {
    const acquire = jest.fn().mockResolvedValue({ data: true, error: null });
    const rpc = makeRpc({ try_acquire_auto_generate_lock: acquire });
    const { service } = makeService({ rpc });

    const result = await service.autoGenerate(termId, deptId, userId, { candidateCount: 2 } as any);

    expect(result.success).toBe(true);
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(acquire).toHaveBeenCalledWith('try_acquire_auto_generate_lock', {
      p_term_id: Number(termId),
      p_dept_id: Number(deptId),
      p_user_id: userId,
      p_ttl_seconds: 300,
    });
  });

  it('recognizes a message-only missing-function error and falls back to the term-scoped acquire signature', async () => {
    const acquire = jest.fn(async (_fn: string, args: any) => {
      if (Object.prototype.hasOwnProperty.call(args, 'p_dept_id')) {
        return missingFunctionError('try_acquire_auto_generate_lock', true);
      }
      return { data: true, error: null };
    });
    const rpc = makeRpc({ try_acquire_auto_generate_lock: acquire });
    const { service } = makeService({ rpc });

    const result = await service.autoGenerate(termId, deptId, userId, { candidateCount: 2 } as any);

    expect(result.success).toBe(true);
    expect(acquire).toHaveBeenCalledTimes(2);
    expect(acquire.mock.calls[1][1]).not.toHaveProperty('p_dept_id');
  });

  it('throws an infrastructure error instead of a busy result when no acquire signature exists', async () => {
    const acquire = jest
      .fn()
      .mockResolvedValue(missingFunctionError('try_acquire_auto_generate_lock'));
    const rpc = makeRpc({ try_acquire_auto_generate_lock: acquire });
    const { service, dispatcher } = makeService({ rpc });

    await expect(
      service.autoGenerate(termId, deptId, userId, { candidateCount: 2 } as any),
    ).rejects.toThrow(
      'No compatible try_acquire_auto_generate_lock RPC signature is available',
    );
    expect(acquire).toHaveBeenCalledTimes(2);
    const finished = dispatcher.dispatch.mock.calls.filter(
      ([event]: [string]) => event === 'auto_generate.finished',
    );
    expect(finished).toHaveLength(0);
  });

  it('surfaces a non-signature RPC error without retrying the acquire function', async () => {
    const acquire = jest.fn().mockResolvedValue({
      data: null,
      error: {
        code: '42501',
        message: 'permission denied for function try_acquire_auto_generate_lock',
      },
    });
    const rpc = makeRpc({ try_acquire_auto_generate_lock: acquire });
    const { service } = makeService({ rpc });

    await expect(
      service.autoGenerate(termId, deptId, userId, { candidateCount: 2 } as any),
    ).rejects.toThrow(/permission denied for function/);
    expect(acquire).toHaveBeenCalledTimes(1);
  });

  it('caches the successful acquire signature for later calls on the same service', async () => {
    const { service, rpc } = makeService();

    await (service as any).tryAcquireAutoGenerateLock(termId, deptId, userId);
    await (service as any).tryAcquireAutoGenerateLock(termId, deptId, userId);

    const acquireCalls = rpcCalls(rpc, 'try_acquire_auto_generate_lock');
    expect(acquireCalls).toHaveLength(3);
    expect(acquireCalls[0][1]).toHaveProperty('p_dept_id');
    expect(acquireCalls[1][1]).not.toHaveProperty('p_dept_id');
    expect(acquireCalls[2][1]).toEqual(acquireCalls[1][1]);
  });
});
