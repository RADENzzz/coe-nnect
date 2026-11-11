import { UsersService } from '../src/modules/users/users.service';
import { createFakeRepository } from './fakes/repository.fake';

function createService(options?: {
  users?: Record<string, any>[];
  presence?: Record<string, any>[];
}) {
  const userRepo = createFakeRepository(options?.users ?? [], {
    idKey: 'userId',
  });
  const presenceRepo = {
    find: jest.fn(async () =>
      (options?.presence ?? []).map((row) => ({ ...row })),
    ),
    upsert: jest.fn(async () => ({
      identifiers: [],
      generatedMaps: [],
      raw: [],
    })),
  };

  return {
    service: new UsersService(
      {} as any,
      userRepo as any,
      presenceRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    ),
    presenceRepo,
  };
}

describe('UsersService presence', () => {
  it('projects last_seen_at into the directory and leaves never-seen users null', async () => {
    const { service } = createService({
      users: [
        {
          userId: 'u1',
          username: 'head-a',
          role: 'department_head',
          deptId: '1',
          isActive: true,
        },
        {
          userId: 'u2',
          username: 'head-b',
          role: 'department_head',
          deptId: '2',
          isActive: true,
        },
      ],
      presence: [
        {
          userId: 'u1',
          lastSeenAt: new Date('2026-11-11T01:00:00.000Z'),
        },
      ],
    });

    await expect(service.findDirectory()).resolves.toEqual([
      {
        user_id: 'u1',
        username: 'head-a',
        role: 'department_head',
        dept_id: '1',
        is_active: true,
        last_seen_at: '2026-11-11T01:00:00.000Z',
      },
      {
        user_id: 'u2',
        username: 'head-b',
        role: 'department_head',
        dept_id: '2',
        is_active: true,
        last_seen_at: null,
      },
    ]);
  });

  it('upserts exactly one presence row per heartbeat', async () => {
    const { service, presenceRepo } = createService();

    const result = await service.heartbeat('u1');

    expect(Date.parse(result.last_seen_at)).not.toBeNaN();
    expect(presenceRepo.upsert).toHaveBeenCalledTimes(1);
    expect(presenceRepo.upsert).toHaveBeenCalledWith(
      { userId: 'u1', lastSeenAt: expect.any(Date) },
      { conflictPaths: ['userId'] },
    );
  });
});
