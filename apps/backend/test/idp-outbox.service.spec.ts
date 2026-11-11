import { IdpOutboxService } from '../src/modules/idp/idp-outbox.service';
import type { IdpPublishedSchedulePayload } from '../src/modules/idp/idp.types';
import { createFakeRepository } from './fakes/repository.fake';

function payload(overrides: Partial<IdpPublishedSchedulePayload> = {}) {
  return {
    coe_nnect_version_id: '77',
    version_number: 3,
    term_code: '2026-2027-1st',
    published_at: '2026-11-11T00:00:00.000Z',
    entries: [
      {
        coe_nnect_schedule_id: '1',
        department_code: 'CPE',
        section_code: 'A',
        subject_code: 'CPE 111',
        faculty_wmsu_id: '2019-00123',
        external_faculty_name: null,
        room_number: '101',
        external_room_name: null,
        day_of_week: 'Monday',
        start_time: '08:00',
        end_time: '09:00',
        load_type: 'lecture',
      },
    ],
    ...overrides,
  } as IdpPublishedSchedulePayload;
}

describe('IdpOutboxService', () => {
  let repo: ReturnType<typeof createFakeRepository>;
  let service: IdpOutboxService;

  beforeEach(() => {
    repo = createFakeRepository([], { idKey: 'outboxId' });
    let nextId = 1;
    repo.create.mockImplementation(
      (input: Record<string, any>) =>
        ({ outboxId: String(nextId++), ...input }) as any,
    );
    service = new IdpOutboxService(repo as any);
  });

  it('queues a schedule with the version id as the idempotency key', async () => {
    const item = await service.enqueueSchedule(payload());

    expect(item).toMatchObject({
      outboxId: '1',
      kind: 'schedule.published',
      idempotencyKey: '77',
      payload: { coe_nnect_version_id: '77' },
    });
    expect(item.createdAt).toBeInstanceOf(Date);
    expect(repo.rows).toHaveLength(1);
  });

  it('returns the existing row when the same version is queued twice', async () => {
    const first = await service.enqueueSchedule(payload());
    const second = await service.enqueueSchedule(
      payload({ published_at: '2026-11-12T00:00:00.000Z' }),
    );

    expect(second.outboxId).toBe(first.outboxId);
    expect(second.payload.published_at).toBe('2026-11-11T00:00:00.000Z');
    expect(repo.rows).toHaveLength(1);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('rejects a payload without coe_nnect_version_id', async () => {
    await expect(
      service.enqueueSchedule(payload({ coe_nnect_version_id: '  ' })),
    ).rejects.toMatchObject({
      response: { error: { code: 'validation_error' } },
      status: 422,
    });
  });

  it('polls inclusively by since and orders oldest first', async () => {
    const older = payload({
      coe_nnect_version_id: '1',
    });
    const newer = payload({
      coe_nnect_version_id: '2',
      version_number: 4,
    });

    const first = await service.enqueueSchedule(older);
    first.createdAt = new Date('2026-11-11T01:00:00.000Z');
    const second = await service.enqueueSchedule(newer);
    second.createdAt = new Date('2026-11-11T02:00:00.000Z');

    const page = await service.listSchedules({
      since: '2026-11-11T01:00:00.000Z',
    });

    expect(page.items.map((item) => item.idempotency_key)).toEqual(['1', '2']);
    expect(page.next_since).toBe('2026-11-11T02:00:00.000Z');
    expect(page.server_time).toBeDefined();
  });

  it('honours limit and repeats the last cursor', async () => {
    for (const [index, hour] of ['01', '02', '03'].entries()) {
      const item = await service.enqueueSchedule(
        payload({ coe_nnect_version_id: String(index + 1) }),
      );
      item.createdAt = new Date(`2026-11-11T${hour}:00:00.000Z`);
    }

    const page = await service.listSchedules({ limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.next_since).toBe('2026-11-11T02:00:00.000Z');
  });

  it('returns an empty page with the cursor when nothing new exists', async () => {
    const page = await service.listSchedules({
      since: '2026-11-11T02:00:00.000Z',
    });

    expect(page.items).toEqual([]);
    expect(page.next_since).toBe('2026-11-11T02:00:00.000Z');
  });

  it('rejects an invalid since or limit', async () => {
    await expect(
      service.listSchedules({ since: 'not-a-date' }),
    ).rejects.toMatchObject({
      response: { error: { code: 'validation_error' } },
      status: 422,
    });
    await expect(service.listSchedules({ limit: 0 })).rejects.toMatchObject({
      response: { error: { code: 'validation_error' } },
      status: 422,
    });
    await expect(service.listSchedules({ limit: 999 })).rejects.toMatchObject({
      response: { error: { code: 'validation_error' } },
      status: 422,
    });
  });
});
