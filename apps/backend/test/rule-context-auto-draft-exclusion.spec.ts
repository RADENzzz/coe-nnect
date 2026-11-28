import 'reflect-metadata';

import { RuleContextBuilder } from '../src/modules/scheduling/services/rule-context.builder';

type QueryResult = { data: any; error: any };

function makeQuery(result: QueryResult) {
  const q: any = {
    select: jest.fn(() => q),
    eq: jest.fn(() => q),
    in: jest.fn(() => q),
    or: jest.fn(() => q),
    not: jest.fn(() => q),
    like: jest.fn(() => q),
    single: jest.fn(async () => result),
    maybeSingle: jest.fn(async () => result),
    then: (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

function createSupabaseMock() {
  const scheduleRows = [
    {
      schedule_id: 'keep-1',
      term_id: 'term-1',
      subject_id: 'sub-1',
      faculty_id: 'fac-1',
      room_id: 'room-1',
      external_room_name: null,
      section: 'SEC-1',
      load_type: 'lecture',
      day_of_week: 'Monday',
      start_time: '08:00',
      end_time: '09:00',
    },
    {
      schedule_id: 'drop-1',
      term_id: 'term-1',
      subject_id: 'sub-2',
      faculty_id: 'fac-1',
      room_id: 'room-2',
      external_room_name: null,
      section: 'SEC-1',
      load_type: 'lecture',
      day_of_week: 'Monday',
      start_time: '09:00',
      end_time: '10:00',
    },
  ];

  const facultyRow = {
    faculty_id: 'fac-1',
    first_name: 'Ada',
    last_name: 'Lovelace',
    dept_id: 'dept-1',
    classification: 'regular',
    designation_id: null,
    required_hours: 18,
  };

  const subjectRow = {
    subject_id: 'sub-1',
    subject_code: 'CS 101',
    title: 'Intro',
    total_units: 3,
    lecture_units: 3,
    lab_units: 0,
    required_room_type: 'lecture',
    dept_id: 'dept-1',
  };

  const calls: Array<{ table: string; op: string; args: any[] }> = [];

  const client = {
    from: jest.fn((table: string) => {
      if (table === 'schedule') {
        let selectClause = '';
        const filters: Array<{ op: string; args: any[] }> = [];
        const q: any = {
          select: jest.fn((s: string) => {
            selectClause = s;
            calls.push({ table, op: 'select', args: [s] });
            return q;
          }),
          eq: jest.fn((...args: any[]) => {
            filters.push({ op: 'eq', args });
            return q;
          }),
          in: jest.fn((...args: any[]) => {
            filters.push({ op: 'in', args });
            return q;
          }),
          or: jest.fn((...args: any[]) => {
            filters.push({ op: 'or', args });
            return q;
          }),
          not: jest.fn((...args: any[]) => {
            filters.push({ op: 'not', args });
            calls.push({ table, op: 'not', args });
            return q;
          }),
          then: (resolve: any, reject: any) => {
            let rows = [...scheduleRows];
            const hasFacultyFilter = filters.some(
              (f) => f.op === 'eq' && f.args[0] === 'faculty_id',
            );
            const hasDayFilter = filters.some(
              (f) => f.op === 'eq' && f.args[0] === 'day_of_week',
            );

            if (hasDayFilter) {
              const day = filters.find(
                (f) => f.op === 'eq' && f.args[0] === 'day_of_week',
              )?.args[1];
              rows = rows.filter((r) => r.day_of_week === day);
            }
            if (hasFacultyFilter) {
              const facultyId = filters.find(
                (f) => f.op === 'eq' && f.args[0] === 'faculty_id',
              )?.args[1];
              rows = rows.filter((r) => r.faculty_id === facultyId);
            }

            const notIn = filters.find(
              (f) => f.op === 'not' && f.args[0] === 'schedule_id' && f.args[1] === 'in',
            );
            if (notIn) {
              const raw = String(notIn.args[2] ?? '');
              const excluded = raw
                .replace(/^\(/, '')
                .replace(/\)$/, '')
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean);
              rows = rows.filter((r) => !excluded.includes(r.schedule_id));
            }

            if (selectClause.includes('lecture_units')) {
              const data = rows.map((r) => ({
                schedule_id: r.schedule_id,
                subject: { lecture_units: 3, lab_units: 0 },
              }));
              return Promise.resolve({ data, error: null }).then(resolve, reject);
            }

            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
          },
        };
        return q;
      }

      if (table === 'faculty') {
        return makeQuery({ data: facultyRow, error: null });
      }
      if (table === 'subject') {
        return makeQuery({ data: subjectRow, error: null });
      }
      if (table === 'faculty_qualification') {
        return makeQuery({ data: [], error: null });
      }
      if (table === 'faculty_preference') {
        return makeQuery({ data: [], error: null });
      }
      if (table === 'faculty_unavailability') {
        return makeQuery({ data: [], error: null });
      }
      if (table === 'faculty_commitment') {
        return makeQuery({ data: [], error: null });
      }
      if (table === 'minor_subject_schedule') {
        return makeQuery({ data: [], error: null });
      }
      if (table === 'subject_restriction') {
        return makeQuery({ data: [], error: null });
      }
      if (table === 'faculty_request') {
        return makeQuery({ data: [], error: null });
      }
      if (table === 'scheduling_setting') {
        return makeQuery({ data: [], error: null });
      }
      if (table === 'designation') {
        return makeQuery({ data: null, error: null });
      }
      if (table === 'section') {
        return makeQuery({ data: null, error: null });
      }
      if (table === 'room') {
        return makeQuery({ data: null, error: null });
      }

      return makeQuery({ data: null, error: null });
    }),
  };

  return { client, calls };
}

describe('RuleContextBuilder auto-draft exclusion', () => {
  it('excludes listed schedule ids from existingSchedule', async () => {
    const { client } = createSupabaseMock();
    const builder = new RuleContextBuilder({
      getAdminClient: () => client,
    } as any);

    const context = await builder.build({
      termId: 'term-1',
      subjectId: 'sub-1',
      facultyId: 'fac-1',
      section: 'SEC-1',
      dayOfWeek: 'Monday',
      startTime: '08:00',
      endTime: '09:00',
      excludeScheduleIds: ['drop-1'],
    } as any);

    expect(
      context.existingSchedule.map((row) => row.scheduleId),
    ).not.toContain('drop-1');
    expect(context.existingSchedule.map((row) => row.scheduleId)).toContain(
      'keep-1',
    );
  });

  it('excludes listed schedule ids from faculty assignedHours', async () => {
    const { client } = createSupabaseMock();
    const builder = new RuleContextBuilder({
      getAdminClient: () => client,
    } as any);

    const context = await builder.build({
      termId: 'term-1',
      subjectId: 'sub-1',
      facultyId: 'fac-1',
      section: 'SEC-1',
      dayOfWeek: 'Monday',
      startTime: '08:00',
      endTime: '09:00',
      excludeScheduleIds: ['drop-1'],
    } as any);

    // keep-1 gives 3 lecture units * 1 hour = 3; drop-1 excluded
    expect(context.faculty?.assignedHours).toBe(3);
  });

  it('forwards scheduleDeptId for F-8', async () => {
    const { client } = createSupabaseMock();
    const builder = new RuleContextBuilder({
      getAdminClient: () => client,
    } as any);

    const context = await builder.build({
      termId: 'term-1',
      scheduleDeptId: 'dept-4',
      subjectId: 'sub-1',
      facultyId: 'fac-1',
      section: 'SEC-1',
      dayOfWeek: 'Monday',
      startTime: '08:00',
      endTime: '09:00',
    });

    expect(context.scheduleDeptId).toBe('dept-4');
  });
});
