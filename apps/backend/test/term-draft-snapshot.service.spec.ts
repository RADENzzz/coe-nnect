import 'reflect-metadata';

import { strict as assert } from 'node:assert';
import { ScheduleCatalogResolver } from '../src/modules/scheduling/services/schedule-catalog-resolver.service';
import { TermDraftSnapshotService } from '../src/modules/scheduling/services/term-draft-snapshot.service';
import { createFakeRepository } from './fakes/repository.fake';

const actor = { userId: 'u1', role: 'department_head', deptId: '2' };
const target = { termId: '1', deptId: '2', confirmed: true };

function query(data: unknown) {
  const result: any = { data, error: null };
  result.select = jest.fn(() => result);
  result.eq = jest.fn(() => result);
  result.in = jest.fn(() => result);
  result.maybeSingle = jest.fn(async () => ({ data, error: null }));
  result.then = (resolve: any, reject: any) =>
    Promise.resolve({ data, error: null }).then(resolve, reject);
  return result;
}

function supabaseFake() {
  const from = jest.fn((table: string) => {
    if (table === 'term') {
      return query({
        term_id: '1',
        term_name: 'First Semester',
        semester: '1st',
        school_year: '2026-2027',
        is_active: true,
      });
    }
    if (table === 'program') return query([{ program_id: 'P1' }]);
    if (table === 'prospectus') return query([{ subject_id: 'S1' }]);
    return query(null);
  });
  return { getAdminClient: jest.fn(() => ({ from })) };
}

function snapshotEntry() {
  return {
    schedule_id: 'snapshot-1',
    subject_id: 'S1',
    subject_code: 'CODE-S1',
    subject_title: 'Subject S1',
    section_id: 'SEC1',
    section_code: 'SEC1',
    faculty_id: null,
    external_faculty_name: 'Prof X',
    faculty_name: 'Prof X',
    room_id: '101',
    room_number: 'R-101',
    building: 'Main',
    external_room_name: null,
    day_of_week: 'Monday',
    start_time: '08:00',
    end_time: '10:00',
    load_type: 'lecture',
    status: 'draft',
    remarks: null,
    dept_id: '2',
    session_index: 0,
  };
}

function pendingRow() {
  return {
    scheduleId: 'draft-pending',
    termId: '1',
    subjectId: 'S1',
    subject: { subjectId: 'S1', subjectCode: 'CODE-S1', title: 'Subject S1', deptId: '2', isActive: true },
    sectionId: 'SEC2',
    section: 'SEC2',
    sectionRef: { sectionId: 'SEC2', sectionCode: 'SEC2', isActive: true },
    facultyId: null,
    externalFacultyName: null,
    faculty: null,
    roomId: null,
    externalRoomName: null,
    room: null,
    timeslotId: null,
    dayOfWeek: 'Thursday',
    startTime: '13:00:00',
    endTime: '14:30:00',
    loadType: 'lecture',
    status: 'draft',
    remarks: null,
    deptId: '2',
    pendingFacultyRequestId: '55',
    pendingFacultyDeptId: '3',
    sessionIndex: 0,
  };
}

describe('TermDraftSnapshotService', () => {
  it('blocks a load and preserves an existing request on an unmatched pending row', async () => {
    const snapshotRepo = createFakeRepository(
      [
        {
          termDraftSnapshotId: 'snap-1',
          termId: '1',
          deptId: '2',
          name: 'Working A',
          termName: 'First Semester',
          semester: '1st',
          schoolYear: '2026-2027',
          snapshot: { snapshot_version: 1, entries: [snapshotEntry()] },
          createdBy: 'u1',
          createdAt: new Date(),
        },
      ],
      { idKey: 'termDraftSnapshotId' },
    );
    const scheduleRepo = createFakeRepository([pendingRow()], {
      idKey: 'scheduleId',
    });
    const subjectRepo = createFakeRepository([
      { subjectId: 'S1', subjectCode: 'CODE-S1', title: 'Subject S1', deptId: '2', isActive: true },
    ]);
    const roomRepo = createFakeRepository([
      { roomId: '101', roomNumber: 'R-101', building: 'Main', isActive: true },
    ]);
    const facultyRepo = createFakeRepository([]);
    const sectionRepo = createFakeRepository([
      { sectionId: 'SEC1', sectionCode: 'SEC1', isActive: true },
      { sectionId: 'SEC2', sectionCode: 'SEC2', isActive: true },
    ]);
    const catalog = new ScheduleCatalogResolver(
      subjectRepo as any,
      roomRepo as any,
      facultyRepo as any,
      sectionRepo as any,
    );
    const ruleContextBuilder = {
      build: jest.fn(async () => ({ existingSchedule: [] })),
    };
    const constraints = {
      evaluate: jest.fn(() => ({
        valid: true,
        hardConflicts: [],
        softWarnings: [],
        evaluations: [],
      })),
    };
    const departments = { isActive: jest.fn(async () => true) };
    const facultyGate = {
      ensureCrossDeptFacultyRequest: jest.fn(async () => null),
      cancelOrphanedFacultyRequest: jest.fn(async () => undefined),
    };
    const manager = {
      create: jest.fn(() => ({})),
      merge: jest.fn(() => ({})),
      save: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
    };
    const dataSource = {
      transaction: jest.fn(async (callback: any) => callback(manager)),
    };
    const service = new TermDraftSnapshotService(
      snapshotRepo as any,
      {} as any,
      scheduleRepo as any,
      supabaseFake() as any,
      catalog as any,
      ruleContextBuilder as any,
      constraints as any,
      departments as any,
      facultyGate as any,
      dataSource as any,
    );

    const result = await service.apply('snap-1', target as any, actor);

    assert.equal(result.failed, true);
    assert.ok(
      result.conflicts.some((conflict) =>
        /pending faculty request/i.test(conflict.reason),
      ),
    );
    assert.equal(dataSource.transaction.mock.calls.length, 0);
    assert.equal(manager.save.mock.calls.length, 0);
    assert.equal(manager.delete.mock.calls.length, 0);
    assert.equal(facultyGate.cancelOrphanedFacultyRequest.mock.calls.length, 0);
  });
});
