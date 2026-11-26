import 'reflect-metadata';

import { strict as assert } from 'node:assert';
import { Term } from '../src/modules/terms/entities/term.entity';
import { Schedule } from '../src/modules/scheduling/entities/schedule.entity';
import { TermPublishedVersion } from '../src/modules/scheduling/entities/term-published-version.entity';
import { TermPublishedVersionService, type PublishedVersionEntry } from '../src/modules/scheduling/services/term-published-version.service';
import { createFakeRepository } from './fakes/repository.fake';
import { deanProfile } from './helpers/profiles';

type Repo = ReturnType<typeof createFakeRepository>;

let nextScheduleId = 0;

function schedule(
  subjectId: string,
  sectionId: string | null,
  loadType: 'lecture' | 'laboratory' | 'other' | null,
  overrides: Record<string, unknown> = {},
) {
  nextScheduleId += 1;
  return {
    scheduleId: `s${String(nextScheduleId).padStart(3, '0')}`,
    termId: '1',
    subjectId,
    subject: { subjectCode: `CODE-${subjectId}`, title: `Subject ${subjectId}` },
    sectionId,
    section: sectionId ? `SEC-${sectionId}` : null,
    sectionRef: sectionId ? { sectionCode: `SEC-${sectionId}` } : null,
    facultyId: null,
    externalFacultyName: null,
    roomId: null,
    room: null,
    externalRoomName: null,
    dayOfWeek: 'Monday',
    startTime: '08:00',
    endTime: '10:00',
    loadType,
    status: 'draft',
    remarks: null,
    deptId: '1',
    ...overrides,
  };
}

describe('TermPublishedVersionService', () => {
  let versionRepo: Repo;
  let scheduleRepo: Repo;
  let termRepo: Repo;
  let service: TermPublishedVersionService;

  beforeEach(() => {
    nextScheduleId = 0;
    versionRepo = createFakeRepository([], { idKey: 'termPublishedVersionId' });
    scheduleRepo = createFakeRepository([], { idKey: 'scheduleId', autoId: true });
    termRepo = createFakeRepository([], { idKey: 'termId' });
    service = new TermPublishedVersionService(
      versionRepo as any,
      scheduleRepo as any,
      termRepo as any,
    );
    // A saved row already exists for term 1; construction itself writes nothing.
    seedVersion();
  });

  function seedSchedules(statuses: string[]) {
    for (const [index, status] of statuses.entries()) {
      scheduleRepo.rows.push(
        schedule(String(index + 1), `SEC${index + 1}`, 'lecture', { status }),
      );
    }
  }

  function seedTerm(overrides: Record<string, unknown> = {}) {
    termRepo.rows.push({
      termId: '1',
      termName: 'Exact',
      semester: '1st',
      schoolYear: '2026-2027',
      isActive: true,
      startDate: null,
      endDate: null,
      ...overrides,
    });
  }

  function seedVersion(overrides: Record<string, unknown> = {}) {
    const row = {
      // `versionId` mirrors the brief's shorthand; the entity key is
      // `termPublishedVersionId`. Both survive an in-place upsert.
      versionId: overrides.versionId ?? '9',
      termPublishedVersionId: overrides.versionId ?? '9',
      termId: overrides.termId ?? '1',
      versionNumber: overrides.versionNumber ?? 1,
      termName: overrides.termName ?? 'Exact',
      semester: overrides.semester ?? '1st',
      schoolYear: overrides.schoolYear ?? '2026-2027',
      snapshot: overrides.snapshot ?? { snapshot_version: 1, entries: [], entry_count: 0 },
      publishedAt: overrides.publishedAt ?? new Date('2026-01-01T00:00:00Z'),
      deactivatedAt: overrides.deactivatedAt ?? null,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      lastModifiedBy: deanProfile.userId,
    };
    const index = versionRepo.rows.findIndex(
      (existing) => String(existing.termPublishedVersionId) === String(row.termPublishedVersionId),
    );
    if (index >= 0) versionRepo.rows[index] = row;
    else versionRepo.rows.push(row);
  }

  function seedVersionWithEntries(scheduleIds: string[]) {
    const entries: PublishedVersionEntry[] = scheduleIds.map((scheduleId, index) => ({
      schedule_id: scheduleId,
      subject_id: String(index + 1),
      subject_code: `CODE-${index + 1}`,
      subject_title: `Subject ${index + 1}`,
      section_id: `SEC${index + 1}`,
      section_code: `SEC${index + 1}`,
      faculty_id: null,
      external_faculty_name: null,
      faculty_name: null,
      room_id: null,
      room_number: null,
      building: null,
      external_room_name: null,
      day_of_week: 'Monday',
      start_time: '08:00',
      end_time: '10:00',
      load_type: 'lecture',
      status: 'published',
      remarks: null,
      dept_id: '1',
      session_index: 0,
    }));
    seedVersion({
      snapshot: {
        snapshot_version: 1,
        entry_count: entries.length,
        entries,
      },
    });
  }

  it('captures every plotted status and preserves id and version number on rewrite', async () => {
    seedVersion({ versionId: '9', termId: '1', versionNumber: 1 });
    seedSchedules(['draft', 'review', 'finalized', 'published']);
    const saved = (await service.writeTerm('1', deanProfile, 'published')) as any;
    assert.equal(saved.versionId, '9');
    assert.equal(saved.termPublishedVersionId, '9');
    assert.equal(saved.versionNumber, 1);
    assert.equal(saved.snapshot.entry_count, 4);
    assert.deepEqual(
      saved.snapshot.entries.map((e: PublishedVersionEntry) => e.status),
      ['draft', 'review', 'finalized', 'published'],
    );
  });

  it('does not write anything during construction (no backfill)', () => {
    assert.equal(versionRepo.save.mock.calls.length, 0);
  });

  it('assigns session_index to repeated subject/section/load sessions', async () => {
    seedSchedules([]);
    scheduleRepo.rows.push(schedule('S1', 'SEC1', 'lecture'));
    scheduleRepo.rows.push(schedule('S1', 'SEC1', 'lecture'));
    const snapshot = (await service.writeTerm('1', deanProfile, 'published')).snapshot as any;
    assert.deepEqual(snapshot.entries.map((e: PublishedVersionEntry) => e.session_index), [0, 1]);
  });

  it('marks stale when the source term is missing or its labels changed, and locks stale or inactive terms', async () => {
    seedVersion({ termId: '99', termName: 'Old', semester: '1st', schoolYear: '2025-2026' });
    assert.equal((await service.findById('9')).stale, true); // term 99 deleted
    assert.equal((await service.findById('9')).locked, true);

    seedVersion({ versionId: '11', termId: '1', termName: 'Renamed', semester: '1st', schoolYear: '2026-2027' });
    seedTerm({ termName: 'Actual', semester: '1st', schoolYear: '2026-2027' });
    assert.equal((await service.findById('11')).stale, true); // captured labels differ

    seedVersion({ versionId: '10', termId: '2', termName: 'Exact', semester: '1st', schoolYear: '2026-2027' });
    seedTerm({ termId: '2', termName: 'Exact', semester: '1st', schoolYear: '2026-2027', isActive: false });
    assert.deepEqual([await service.findById('10')].map((v) => [v.stale, v.locked]), [[false, true]]);
  });

  it('entriesFor filters to published rows when asked', async () => {
    seedSchedules(['draft', 'published']);
    await service.writeTerm('1', deanProfile, 'published');
    assert.deepEqual(
      (await service.entriesFor('9', ['published'])).map((e) => e.status),
      ['published'],
    );
  });

  it('restoreTerm reuses free original schedule ids and reports reassigned ids on collision', async () => {
    seedVersionWithEntries(['100', '101']);
    scheduleRepo.rows.push(schedule('x', null, null, { scheduleId: '101' }));
    const result = await service.restoreTerm('1');
    assert.equal(result.restored, 2);
    assert.deepEqual(result.reassignedIds, ['101']);
  });

  it('findBySemester filters on captured semester only', async () => {
    seedVersion({ versionId: '9', termId: '1', semester: '1st', schoolYear: '2025-2026' });
    seedVersion({ versionId: '10', termId: '2', semester: '1st', schoolYear: '2026-2027' });
    seedVersion({ versionId: '11', termId: '3', semester: '2nd', schoolYear: '2026-2027' });
    seedTerm({});
    assert.deepEqual(
      (await service.findBySemester('1st')).map((v) => v.versionId).sort(),
      ['9', '10'].sort(),
    );
    assert.equal((await service.findBySemester()).length, 3);
  });

  it('clearTerm deletes only live rows for the requested term', async () => {
    seedSchedules(['draft', 'published']);
    scheduleRepo.rows.push(schedule('x', null, null, { termId: '2' }));
    assert.equal(await service.clearTerm('1'), 2);
    assert.equal(scheduleRepo.rows.length, 1);
    assert.equal(scheduleRepo.rows[0].termId, '2');
  });

  it('uses the transaction manager repositories when one is supplied', async () => {
    const managedVersions = createFakeRepository([], { idKey: 'termPublishedVersionId' });
    const managedSchedules = createFakeRepository([], { idKey: 'scheduleId', autoId: true });
    const managedTerms = createFakeRepository([], { idKey: 'termId' });
    const manager = {
      getRepository: jest.fn((entity: any) => {
        if (entity === TermPublishedVersion) return managedVersions;
        if (entity === Schedule) return managedSchedules;
        if (entity === Term) return managedTerms;
        throw new Error('Unexpected repository');
      }),
    };
    managedSchedules.rows.push(schedule('m1', 'SEC1', 'lecture', {
      scheduleId: 'm001',
      status: 'published',
    }));
    managedTerms.rows.push({
      termId: '1',
      termName: 'Exact',
      semester: '1st',
      schoolYear: '2026-2027',
      isActive: true,
    });

    await service.writeTerm('1', deanProfile, 'published', manager as any);
    assert.equal(manager.getRepository.mock.calls.length, 3);
    assert.equal(managedVersions.rows.length, 1);
    assert.equal(versionRepo.save.mock.calls.length, 0);

    const restored = await service.restoreTerm('1', manager as any);
    assert.deepEqual(restored.reassignedIds, ['m001']);
    assert.equal(managedSchedules.rows.length, 2);
    assert.equal(await service.clearTerm('1', manager as any), 2);
    assert.equal(managedSchedules.rows.length, 0);
  });
});
