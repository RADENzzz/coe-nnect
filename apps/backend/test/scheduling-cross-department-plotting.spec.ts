import 'reflect-metadata';

import { strict as assert } from 'node:assert';
import { SchedulingService } from '../src/modules/scheduling/scheduling.service';
import { ScheduleFacultyService } from '../src/modules/scheduling/services/schedule-faculty.service';

const unused = {} as any;

const departmentHead = {
  userId: 'u-head',
  username: 'department-head',
  role: 'department_head',
  deptId: '7',
};

function subjectSupabaseMock() {
  const client = {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(async () => ({
            data: {
              subject_id: '99',
              subject_code: 'PSY 101',
              dept_id: '8',
              is_elective: false,
              is_placeholder: false,
            },
            error: null,
          })),
        })),
      })),
    })),
  };
  return { getAdminClient: () => client, client };
}

function plottingHarness() {
  const supabase = subjectSupabaseMock();
  const scheduleRepo = {
    create: jest.fn((entity: any) => entity),
    save: jest.fn(async (entity: any) => entity),
  };
  const faculty = {
    ensureCrossDeptFacultyRequest: jest.fn(async () => null),
    checkFacultyOverload: jest.fn(async () => {}),
    assertOwnership: jest.fn(),
  };
  const departments = {
    assertDepartmentActive: jest.fn(async () => {}),
  };
  const ruleContextBuilder = { build: jest.fn(async () => ({})) };
  const constraints = {
    evaluate: jest.fn(() => ({ valid: true, hardConflicts: [] })),
  };

  const service = new SchedulingService(
    scheduleRepo as any,
    unused,
    unused,
    faculty as any,
    unused,
    unused,
    unused,
    ruleContextBuilder as any,
    constraints as any,
    unused,
    supabase as any,
    unused,
    unused,
    departments as any,
    unused,
    unused,
    unused,
  );

  return { service, scheduleRepo, faculty, departments };
}

test('a department head plots a foreign minor under their own department', async () => {
  const { service, scheduleRepo, faculty, departments } = plottingHarness();

  const saved = await service.plot(
    {
      termId: '1',
      subjectId: '99',
      externalFacultyName: 'Visiting Professor',
      externalRoomName: 'Room 204',
      dayOfWeek: 'Monday',
      startTime: '08:00',
      endTime: '09:30',
    } as any,
    departmentHead as any,
  );

  assert.equal(saved.deptId, '7');
  assert.equal(scheduleRepo.save.mock.calls.length, 1);
  const deptCalls = departments.assertDepartmentActive.mock.calls as any[][];
  assert.equal(deptCalls.length, 1);
  assert.equal(deptCalls[0][0], '7');
  const gateCalls = faculty.ensureCrossDeptFacultyRequest.mock
    .calls as any[][];
  assert.equal(gateCalls.length, 1);
  assert.equal(gateCalls[0][0].scheduleDeptId, '7');
});

test('a department head plots multiple sessions of a foreign minor under their own department', async () => {
  const { service, scheduleRepo } = plottingHarness();

  const saved = await service.plotMulti(
    {
      termId: '1',
      subjectId: '99',
      externalFacultyName: 'Visiting Professor',
      externalRoomName: 'Room 204',
      sessions: [
        { dayOfWeek: 'Monday', startTime: '08:00', endTime: '09:30' },
        { dayOfWeek: 'Wednesday', startTime: '08:00', endTime: '09:30' },
      ],
    } as any,
    departmentHead as any,
  );

  assert.equal(saved.length, 2);
  assert.deepEqual(
    saved.map((entry: any) => entry.deptId),
    ['7', '7'],
  );
  assert.equal(scheduleRepo.save.mock.calls.length, 1);
});

test('a college-wide role still plots under the subject owning department', async () => {
  const { service } = plottingHarness();

  const saved = await service.plot(
    {
      termId: '1',
      subjectId: '99',
      externalFacultyName: 'Visiting Professor',
      externalRoomName: 'Room 204',
      dayOfWeek: 'Monday',
      startTime: '08:00',
      endTime: '09:30',
    } as any,
    { userId: 'u-dean', role: 'college_dean' } as any,
  );

  assert.equal(saved.deptId, '8');
});

test('a department head still cannot edit a foreign department schedule entry', async () => {
  const foreignRow = {
    scheduleId: 's1',
    deptId: '8',
    status: 'draft',
  };
  const scheduleRepo = {
    findOne: jest.fn(async () => foreignRow),
  };
  const service = new ScheduleFacultyService(
    scheduleRepo as any,
    unused,
    unused,
    unused,
  );

  await assert.rejects(
    service.assertOwnership('s1', departmentHead as any),
    /other departments/,
  );
});
