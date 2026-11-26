import 'reflect-metadata';

import { strict as assert } from 'node:assert';
import {
  ScheduleVersionService,
} from '../src/modules/scheduling/services/schedule-version.service';
import {
  TermPublishedVersionService,
  type PublishedVersionEntry,
} from '../src/modules/scheduling/services/term-published-version.service';
import { resolveVersionDeptId } from '../src/modules/scheduling/version-scope';
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

describe('version detail department scope', () => {
  let publishedRepo: Repo;
  let historyRepo: Repo;
  let published: TermPublishedVersionService;
  let versions: ScheduleVersionService;

  beforeEach(() => {
    publishedRepo = createFakeRepository([], { idKey: 'termPublishedVersionId' });
    historyRepo = createFakeRepository([], { idKey: 'versionId' });

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
      createFakeRepository([], { idKey: 'scheduleId' }) as any,
      createFakeRepository([], { idKey: 'termId' }) as any,
    );
    versions = new ScheduleVersionService(
      createFakeRepository([], { idKey: 'scheduleId' }) as any,
      historyRepo as any,
      supabase as any,
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

  it('scopes published snapshot detail and its entryCount to one department', async () => {
    seedPublished('9', [
      entry({ subject_id: 'S1', dept_id: '1' }),
      entry({ subject_id: 'S2', dept_id: '2' }),
      entry({ subject_id: 'S3', dept_id: null }),
    ]);

    const detail = await published.findById('9', '2');

    assert.deepEqual(detail.entries.map((e) => e.subject_id), ['S2']);
    assert.equal(detail.entryCount, 1);
  });

  it('keeps null-department rows in unscoped published detail', async () => {
    seedPublished('9', [
      entry({ subject_id: 'S1', dept_id: null }),
      entry({ subject_id: 'S2', dept_id: '2' }),
    ]);

    const detail = await published.findById('9', null);

    assert.equal(detail.entries.length, 2);
    assert.equal(detail.entryCount, 2);
  });

  it('scopes history snapshot detail and updates entry_count without mutating stored data', async () => {
    seedHistory('11', 'termA', [
      entry({ subject_id: 'S1', dept_id: '1' }),
      entry({ subject_id: 'S2', dept_id: '2' }),
    ]);

    const detail = await versions.findVersion('11', '2');

    assert.deepEqual((detail.snapshot as any).entries.map((e: any) => e.subject_id), ['S2']);
    assert.equal((detail.snapshot as any).entry_count, 1);
    assert.equal(historyRepo.rows[0].snapshot.entry_count, 2);
  });

  it('throws the existing missing-department error for a department head', async () => {
    await assert.rejects(
      async () => resolveVersionDeptId({ ...departmentHeadProfile, deptId: null }, '2'),
      /department id/i,
    );
  });
});
