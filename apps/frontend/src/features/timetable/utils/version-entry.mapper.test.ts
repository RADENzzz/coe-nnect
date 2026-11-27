import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCompareToneMaps,
  versionEntryKey,
  versionEntryToEntry,
} from './version-entry.mapper.ts';

test('versionEntryToEntry preserves day/time, external names, load type, status, and dept', () => {
  const entry = versionEntryToEntry({
    schedule_id: null,
    subject_id: 'S1',
    subject_code: 'CE 101',
    subject_title: 'Statics',
    section_id: 'SEC1',
    section_code: 'A',
    faculty_id: null,
    external_faculty_name: 'Visitor',
    faculty_name: null,
    room_id: null,
    room_number: null,
    building: null,
    external_room_name: 'Annex',
    day_of_week: 'Tuesday',
    start_time: '08:00:00',
    end_time: '10:00:00',
    load_type: 'laboratory',
    status: 'draft',
    remarks: null,
    dept_id: '2',
    session_index: 0,
  } as any);

  assert.equal(entry.id.startsWith('snapshot-'), true);
  assert.equal(entry.day, 'TUE');
  assert.deepEqual([entry.startTime, entry.endTime], ['08:00', '10:00']);
  assert.equal(entry.facultyName, 'Visitor');
  assert.equal(entry.externalRoomName, 'Annex');
  assert.equal(entry.loadType, 'laboratory');
  assert.equal(entry.status, 'draft');
  assert.equal(String(entry.deptId), '2');
});

test('null-department snapshot rows map with no department and neutral tone', () => {
  const mapped = versionEntryToEntry({
    schedule_id: 's1',
    subject_id: 'S1',
    subject_code: 'CE 101',
    subject_title: 'Statics',
    section_id: 'SEC1',
    section_code: 'A',
    faculty_id: null,
    external_faculty_name: null,
    faculty_name: null,
    room_id: null,
    room_number: '201',
    building: null,
    external_room_name: null,
    day_of_week: 'Monday',
    start_time: '07:00:00',
    end_time: '09:00:00',
    load_type: 'lecture',
    status: 'finalized',
    remarks: null,
    dept_id: null,
    session_index: 0,
  } as any);

  assert.equal(mapped.deptId, '');
  assert.equal(mapped.id, 's1');
});

test('buildCompareToneMaps marks added, removed, and changed blocks on the correct side', () => {
  const a = { schedule_id: 'a1', subject_id: 'S1', section_id: 'SEC1', load_type: 'lecture', session_index: 0 } as any;
  const b = { schedule_id: 'b2', subject_id: 'S2', section_id: 'SEC2', load_type: 'lecture', session_index: 0 } as any;
  const changedA = { ...a, schedule_id: 'a3', subject_id: 'S3' } as any;
  const changedB = { ...changedA, schedule_id: 'b3', day_of_week: 'Wednesday' } as any;
  const same = { schedule_id: 'same', subject_id: 'S9', section_id: 'SEC9', load_type: 'lecture', session_index: 0 } as any;

  const tones = buildCompareToneMaps({
    versionA: { versionId: 'a', versionNumber: 1, finalizedByName: null, lastModifiedAt: '', entryCount: 2 },
    versionB: { versionId: 'b', versionNumber: 2, finalizedByName: null, lastModifiedAt: '', entryCount: 2 },
    entriesA: [a, changedA, same],
    entriesB: [b, changedB, same],
    added: [b],
    removed: [a],
    moved: [{ before: changedA, after: changedB, changes: ['day'] }],
    unchanged: 1,
  } as any);

  assert.equal(tones.before.get(versionEntryKey(a)), 'removed');
  assert.equal(tones.before.get(versionEntryKey(changedA)), 'changed');
  assert.equal(tones.after.get(versionEntryKey(b)), 'added');
  assert.equal(tones.after.get(versionEntryKey(changedB)), 'changed');
  assert.equal(tones.before.get(versionEntryKey(same)), undefined);
  assert.equal(tones.after.get(versionEntryKey(same)), undefined);
});

test('versionEntryKey defaults missing and non-integer session indexes to zero', () => {
  const missing = { subject_id: 'S1', section_id: 'SEC1', load_type: 'lecture' };
  const invalid = { ...missing, session_index: 1.5 };

  assert.equal(versionEntryKey(missing as any), 'snapshot-S1-SEC1-lecture-0');
  assert.equal(versionEntryKey(invalid as any), 'snapshot-S1-SEC1-lecture-0');
});
