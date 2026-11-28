import 'reflect-metadata';

import { strict as assert } from 'node:assert';
import {
  ScheduleVersionService,
} from '../src/modules/scheduling/services/schedule-version.service';
import {
  TermPublishedVersionService,
  type PublishedVersionEntry,
} from '../src/modules/scheduling/services/term-published-version.service';
import {
  parseSource,
  VersionCompareService,
} from '../src/modules/scheduling/services/version-compare.service';
import { createFakeRepository } from './fakes/repository.fake';
import { deanProfile, departmentHeadProfile } from './helpers/profiles';

type Repo = ReturnType<typeof createFakeRepository>;

function entry(overrides: Record<string, unknown> = {}): PublishedVersionEntry {
  return {
    schedule_id: null,
    subject_id: 'S1',
    subject_code: 'CODE-S1',
    subject_title: 'Subject S1',
    section_id: 'SEC1',
    section_code: 'SEC1',
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
    ...overrides,
  } as PublishedVersionEntry;
}

function liveRow(
  scheduleId: string,
  subjectId: string,
  sectionId: string,
  loadType: 'lecture' | 'laboratory' | 'other',
  deptId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    scheduleId,
    termId: '1',
    subjectId,
    subject: { subjectCode: `CODE-${subjectId}`, title: `Subject ${subjectId}` },
    sectionId,
    section: sectionId,
    sectionRef: { sectionCode: sectionId },
    facultyId: null,
    externalFacultyName: null,
    roomId: null,
    room: null,
    externalRoomName: null,
    dayOfWeek: 'Monday',
    startTime: '08:00',
    endTime: '10:00',
    loadType,
    status: 'published',
    remarks: null,
    deptId,
    ...overrides,
  };
}

describe('VersionCompareService', () => {
  let publishedRepo: Repo;
  let scheduleRepo: Repo;
  let historyRepo: Repo;
  let termRepo: Repo;
  let published: TermPublishedVersionService;
  let versionService: ScheduleVersionService;
  let drafts: { detail: jest.Mock };
  let service: VersionCompareService;

  beforeEach(() => {
    publishedRepo = createFakeRepository([], { idKey: 'termPublishedVersionId' });
    scheduleRepo = createFakeRepository([], { idKey: 'scheduleId' });
    historyRepo = createFakeRepository([], { idKey: 'versionId' });
    termRepo = createFakeRepository([], { idKey: 'termId' });

    // writeVersion asks the history repository for MAX(version_number).
    (historyRepo as any).createQueryBuilder = jest.fn(() => {
      const builder: any = {
        select: jest.fn(() => builder),
        where: jest.fn(() => builder),
        andWhere: jest.fn(() => builder),
        getRawOne: jest.fn(async () => ({ max: '0' })),
      };
      return builder;
    });

    const supabase = {
      getAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data: null })) })),
            in: jest.fn(async () => ({ data: [] })),
            maybeSingle: jest.fn(async () => ({ data: null })),
          })),
        })),
      })),
    };

    published = new TermPublishedVersionService(
      publishedRepo as any,
      scheduleRepo as any,
      termRepo as any,
    );
    versionService = new ScheduleVersionService(
      scheduleRepo as any,
      historyRepo as any,
      supabase as any,
    );
    drafts = {
      detail: jest.fn(async (snapshotId: string) => ({
        snapshotId,
        termId: '1',
        termName: 'First Semester',
        semester: '1st',
        schoolYear: '2026-2027',
        name: 'Working A',
        entryCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        entries: [],
      })),
    };
    service = new VersionCompareService(
      published as any,
      versionService as any,
      scheduleRepo as any,
      drafts as any,
    );
  });

  function seedHistory(id: string, termId: string, entries: PublishedVersionEntry[]) {
    historyRepo.rows.push({
      versionId: id,
      termId,
      facultyId: null,
      versionNumber: Number(id),
      finalizedBy: null,
      snapshot: {
        snapshot_version: 1,
        term_id: termId,
        entry_count: entries.length,
        entries,
      },
      lastModifiedAt: new Date('2026-01-01T00:00:00Z'),
    });
  }

  function seedPublished(id: string, entries: PublishedVersionEntry[]) {
    publishedRepo.rows.push({
      termPublishedVersionId: id,
      termId: '1',
      versionNumber: 1,
      snapshot: { snapshot_version: 1, entry_count: entries.length, entries },
      publishedAt: new Date('2026-01-01T00:00:00Z'),
      deactivatedAt: null,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      lastModifiedBy: deanProfile.userId,
    });
  }

  it('compares two history versions from different terms without the old same-term guard', async () => {
    seedHistory('11', 'termA', [entry({ subject_id: 'S1', section_id: 'SEC1' })]);
    seedHistory('12', 'termB', [
      entry({ subject_id: 'S2', section_id: 'SEC2', load_type: 'laboratory' }),
    ]);

    const result = await service.compareSources('history:11', 'history:12', deanProfile);

    assert.equal(result.added.length, 1);
    assert.equal(result.removed.length, 1);
    assert.equal(result.unchanged, 0);
    assert.deepEqual([result.versionA.entryCount, result.versionB.entryCount], [1, 1]);
  });

  it('pairs repeated sessions by session_index before diffing', async () => {
    seedHistory('11', 'termA', [
      entry({ schedule_id: 'a1', day_of_week: 'Monday', session_index: 0 }),
      entry({ schedule_id: 'a2', day_of_week: 'Tuesday', session_index: 1 }),
    ]);
    // Snapshot order is deliberately reversed; session 1 is the changed one.
    seedHistory('12', 'termA', [
      entry({ schedule_id: 'b2', day_of_week: 'Wednesday', session_index: 1 }),
      entry({ schedule_id: 'b1', day_of_week: 'Monday', session_index: 0 }),
    ]);

    const result = await versionService.compareVersions('11', '12');

    assert.equal(result.moved.length, 1);
    assert.deepEqual(result.moved[0].changes, ['day']);
    assert.equal(result.moved[0].before.schedule_id, 'a2');
    assert.equal(result.moved[0].after.schedule_id, 'b2');
    assert.equal(result.unchanged, 1);
  });

  it('normalizes a live source to actor-visible rows only', async () => {
    const rows = [
      liveRow('live-1', 'S1', 'SEC1', 'lecture', '1'),
      liveRow('live-2', 'S2', 'SEC2', 'lecture', '2'),
      liveRow('live-3', 'S3', 'SEC3', 'lecture', '3'),
    ];
    scheduleRepo.rows.push(...rows);
    seedPublished(
      '9',
      rows.map((row) =>
        entry({
          subject_id: row.subjectId,
          section_id: row.sectionId,
          section_code: row.sectionId,
          dept_id: row.deptId,
        }),
      ),
    );

    const dhResult = await service.compareSources('live:1', 'published:9', departmentHeadProfile);
    assert.equal(dhResult.versionA.entryCount, 1);
    assert.deepEqual(dhResult.entriesA.map((e) => e.dept_id), ['1']);
    assert.deepEqual(dhResult.entriesB.map((e) => e.dept_id), ['1']);
    assert.equal(dhResult.added.length, 0);
    assert.equal(dhResult.unchanged, 1);

    const deanResult = await service.compareSources('live:1', 'published:9', deanProfile);
    assert.equal(deanResult.versionA.entryCount, 3);
    assert.equal(deanResult.unchanged, 3);
  });

  it('parses draft sources and still rejects unknown prefixes', () => {
    assert.deepEqual(parseSource('published:9'), { kind: 'published', id: '9' });
    assert.deepEqual(parseSource('history:11'), { kind: 'history', id: '11' });
    assert.deepEqual(parseSource('live:1'), { kind: 'live', id: '1' });
    assert.deepEqual(parseSource('draft:1'), { kind: 'draft', id: '1' });
    assert.throws(() => parseSource('mystery:1'), /unknown source/i);
  });

  it('compares a draft with the editable live rows in the same term', async () => {
    drafts.detail.mockImplementation(async (snapshotId: string) => ({
      snapshotId,
      termId: '1',
      termName: 'First Semester',
      semester: '1st',
      schoolYear: '2026-2027',
      name: 'Working A',
      entryCount: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
      entries: [
        entry({ subject_id: 'S1', section_id: 'SEC1', status: 'draft', dept_id: '1' }),
        entry({ subject_id: 'S2', section_id: 'SEC2', status: 'review', dept_id: '1' }),
      ],
    }));
    scheduleRepo.rows.push(
      liveRow('live-draft', 'S1', 'SEC1', 'lecture', '1', { status: 'draft' }),
      liveRow('live-review', 'S2', 'SEC2', 'laboratory', '1', { status: 'review' }),
      liveRow('live-published', 'S3', 'SEC3', 'lecture', '1', { status: 'published' }),
    );

    const result = await service.compareSources(
      'draft:7',
      'live:1',
      departmentHeadProfile,
      '2',
      '1',
    );

    assert.equal(result.versionA.label, 'Working A');
    assert.equal(result.versionB.label, 'Live timetable');
    assert.equal(result.entriesB.length, 2);
    assert.ok(
      result.entriesB.every(
        (item) => item.status === 'draft' || item.status === 'review',
      ),
    );
    assert.equal(drafts.detail.mock.calls.length, 1);
    assert.equal(drafts.detail.mock.calls[0][0], '7');
    assert.equal(drafts.detail.mock.calls[0][1], '1');
    assert.equal(drafts.detail.mock.calls[0][2], '1');
    assert.deepEqual(drafts.detail.mock.calls[0][3], departmentHeadProfile);
  });

  it('compares two drafts with the clicked draft before the picked draft', async () => {
    drafts.detail.mockImplementation(async (snapshotId: string) => ({
      snapshotId,
      termId: '1',
      termName: 'First Semester',
      semester: '1st',
      schoolYear: '2026-2027',
      name: snapshotId === '7' ? 'Before Draft' : 'After Draft',
      entryCount: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      entries: [
        entry({
          subject_id: snapshotId === '7' ? 'S1' : 'S2',
          section_id: snapshotId === '7' ? 'SEC1' : 'SEC2',
          status: 'draft',
          dept_id: '1',
        }),
      ],
    }));

    const result = await service.compareSources(
      'draft:7',
      'draft:8',
      departmentHeadProfile,
      '1',
      '1',
    );

    assert.equal(result.versionA.label, 'Before Draft');
    assert.equal(result.versionB.label, 'After Draft');
    assert.equal(result.added.length, 1);
    assert.equal(result.removed.length, 1);
  });

  it('rejects invalid draft comparison guards', async () => {
    await assert.rejects(
      () =>
        service.compareSources(
          'draft:7',
          'published:9',
          departmentHeadProfile,
          '1',
          '1',
        ),
      /between draft and live or draft/i,
    );
    await assert.rejects(
      () =>
        service.compareSources('draft:7', 'live:1', departmentHeadProfile, '1'),
      /termId is required/i,
    );
    await assert.rejects(
      () =>
        service.compareSources('draft:7', 'live:2', departmentHeadProfile, '1', '1'),
      /same term/i,
    );
    await assert.rejects(
      () => service.compareSources('draft:7', 'live:1', deanProfile, '2', '1'),
      /department_head or administrator/i,
    );
    await assert.rejects(
      () =>
        service.compareSources('draft:7', 'live:1', { role: 'administrator' }, null, '1'),
      /department id|department/i,
    );
    assert.equal(drafts.detail.mock.calls.length, 0);
  });

  it('rejects a source without a colon or id', async () => {
    for (const bare of ['published', 'history', 'live']) {
      assert.throws(() => parseSource(bare), /unknown source/i);
    }
    assert.throws(() => parseSource('published:'), /missing an id/i);
    await assert.rejects(
      () => service.compareSources('published', 'published:9', deanProfile),
      /unknown source/i,
    );
  });

  it('refuses a live source for a department head without a department id', async () => {
    scheduleRepo.rows.push(
      liveRow('live-1', 'S1', 'SEC1', 'lecture', '1'),
      liveRow('live-2', 'S2', 'SEC2', 'lecture', '2'),
    );
    seedPublished('9', []);

    for (const missing of [null, undefined]) {
      await assert.rejects(
        () =>
          service.compareSources('live:1', 'published:9', {
            ...departmentHeadProfile,
            deptId: missing,
          }),
        /department id/i,
      );
    }

    // No live rows were loaded, so no other department's data was exposed.
    assert.equal((scheduleRepo.find as jest.Mock).mock.calls.length, 0);
  });

  it('keeps the old history-only same-term restriction on ScheduleVersionService.compareVersions', async () => {
    seedHistory('11', 'termA', [entry()]);
    seedHistory('12', 'termB', [entry({ subject_id: 'S2', section_id: 'SEC2' })]);

    await assert.rejects(
      () => versionService.compareVersions('11', '12'),
      /different terms/i,
    );
  });

  it('snapshot entries include external_room_name and session_index', async () => {
    scheduleRepo.rows.push(
      liveRow('snap-1', 'S1', 'SEC1', 'lecture', '1', {
        status: 'finalized',
        externalRoomName: 'Annex A',
      }),
      liveRow('snap-2', 'S1', 'SEC1', 'lecture', '1', {
        status: 'published',
        externalRoomName: 'Annex B',
      }),
      liveRow('snap-3', 'S2', 'SEC2', 'laboratory', '1', {
        status: 'finalized',
      }),
    );

    const saved = await versionService.writeVersion('1', deanProfile);
    const snapshot = saved.snapshot as any;

    assert.equal(saved.versionNumber, 1);
    assert.equal(snapshot.entry_count, 3);
    assert.deepEqual(
      snapshot.entries.map((e: Record<string, unknown>) => e.external_room_name),
      ['Annex A', 'Annex B', null],
    );
    assert.deepEqual(
      snapshot.entries.map((e: Record<string, unknown>) => e.session_index),
      [0, 1, 0],
    );
  });

  it('filters all source kinds before diffing and returns both filtered grids', async () => {
    const publishedEntries = [
      entry({ subject_id: 'S1', section_id: 'SEC1', dept_id: '1' }),
      entry({ subject_id: 'S2', section_id: 'SEC2', dept_id: '2' }),
      entry({ subject_id: 'S3', section_id: 'SEC3', dept_id: null }),
    ];
    seedPublished('9', publishedEntries);
    seedHistory('11', 'termA', publishedEntries);

    const result = await service.compareSources(
      'history:11',
      'published:9',
      deanProfile,
      '2',
    );

    assert.deepEqual(result.entriesA.map((e) => e.subject_id), ['S2']);
    assert.deepEqual(result.entriesB.map((e) => e.subject_id), ['S2']);
    assert.deepEqual([result.versionA.entryCount, result.versionB.entryCount], [1, 1]);
    assert.equal(result.added.length, 0);
    assert.equal(result.removed.length, 0);
    assert.equal(result.unchanged, 1);
  });

  it('forces a department head to their own department even when deptId is overridden', async () => {
    seedPublished('9', [
      entry({ subject_id: 'S1', dept_id: '1' }),
      entry({ subject_id: 'S2', dept_id: '2' }),
    ]);
    scheduleRepo.rows.push(
      liveRow('live-1', 'S1', 'SEC1', 'lecture', '1'),
      liveRow('live-2', 'S2', 'SEC2', 'lecture', '2'),
    );

    const result = await service.compareSources(
      'live:1',
      'published:9',
      departmentHeadProfile,
      '2',
    );

    assert.deepEqual(result.entriesA.map((e) => e.dept_id), ['1']);
    assert.deepEqual(result.entriesB.map((e) => e.dept_id), ['1']);
    assert.equal(result.added.length, 0);
    assert.equal(result.removed.length, 0);
  });

  it('includes null-department rows only in an all-department compare', async () => {
    seedPublished('9', [
      entry({ subject_id: 'S1', dept_id: null }),
      entry({ subject_id: 'S2', dept_id: '2' }),
    ]);
    seedHistory('11', 'termA', [
      entry({ subject_id: 'S1', dept_id: null }),
      entry({ subject_id: 'S2', dept_id: '2' }),
    ]);

    const all = await service.compareSources('history:11', 'published:9', deanProfile);
    const scoped = await service.compareSources('history:11', 'published:9', deanProfile, '2');

    assert.equal(all.entriesA.length, 2);
    assert.equal(scoped.entriesA.length, 1);
    assert.equal(scoped.entriesA[0].dept_id, '2');
  });

  it('normalizes session indexes after department filtering', async () => {
    seedPublished('9', [
      entry({ subject_id: 'S1', section_id: 'SEC1', session_index: 0, dept_id: '2' }),
      entry({ subject_id: 'S1', section_id: 'SEC1', session_index: undefined as any, dept_id: '2' }),
      entry({ subject_id: 'S1', section_id: 'SEC1', session_index: 1, dept_id: '1' }),
    ]);

    const result = await service.compareSources('published:9', 'published:9', deanProfile, '2');

    assert.deepEqual(
      result.entriesA.map((e) => e.session_index),
      [0, 1],
    );
  });
});
