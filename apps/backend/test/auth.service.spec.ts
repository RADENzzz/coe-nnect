import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../src/modules/auth/auth.service';
import { createFakeRepository } from './fakes/repository.fake';

function createService(
  signInResult: any,
  profiles: Record<string, any>[] = [],
  maintenance = { active: false, title: null, message: null },
) {
  const supabase = {
    getClient: () => ({
      auth: {
        signInWithPassword: jest.fn(() =>
          signInResult instanceof Error
            ? Promise.reject(signInResult)
            : Promise.resolve(signInResult),
        ),
      },
    }),
  };
  const systemStatus = {
    getMaintenanceNotice: jest.fn().mockResolvedValue(maintenance),
  };
  const userRepo = createFakeRepository(profiles, { idKey: 'userId' });
  return {
    service: new AuthService(
      supabase as any,
      systemStatus as any,
      userRepo as any,
    ),
    userRepo,
  };
}

describe('AuthService', () => {
  it('rejects invalid Supabase credentials', async () => {
    const { service } = createService({
      data: { session: null, user: null },
      error: { message: 'Invalid login credentials' },
    });

    await expect(
      service.login('missing@wmsu.edu.ph', 'wrong-password'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('returns 503 instead of 401 when Supabase auth is unreachable', async () => {
    const { service } = createService({
      data: { session: null, user: null },
      error: {
        name: 'AuthRetryableFetchError',
        status: 0,
        message: 'fetch failed',
      },
    });

    expect.assertions(2);
    try {
      await service.login('head@wmsu.edu.ph', 'correct-password');
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect((err as ServiceUnavailableException).getResponse()).toMatchObject({
        code: 'AUTH_PROVIDER_UNAVAILABLE',
      });
    }
  });

  it('returns 503 when the Supabase client throws a network error', async () => {
    const { service } = createService(new TypeError('fetch failed'));

    await expect(
      service.login('head@wmsu.edu.ph', 'correct-password'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('still returns 401 for genuinely invalid credentials', async () => {
    const { service } = createService({
      data: { session: null, user: null },
      error: { status: 400, message: 'Invalid login credentials' },
    });

    await expect(
      service.login('head@wmsu.edu.ph', 'wrong-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a deactivated profile after a valid password', async () => {
    const { service } = createService(
      {
        data: {
          session: { access_token: 'token', refresh_token: 'refresh' },
          user: { id: 'user-inactive' },
        },
        error: null,
      },
      [
        {
          userId: 'user-inactive',
          username: 'inactive',
          email: 'inactive@wmsu.edu.ph',
          role: 'department_head',
          deptId: '1',
          isActive: false,
        },
      ],
    );

    await expect(
      service.login('inactive@wmsu.edu.ph', 'correct-password'),
    ).rejects.toThrow('Account is deactivated');
  });

  it('rejects a non-admin sign-in while maintenance mode is on', async () => {
    const { service } = createService(
      {
        data: {
          session: { access_token: 'token', refresh_token: 'refresh' },
          user: { id: 'user-head' },
        },
        error: null,
      },
      [
        {
          userId: 'user-head',
          username: 'head',
          email: 'head@wmsu.edu.ph',
          role: 'department_head',
          deptId: '1',
          isActive: true,
        },
      ],
      {
        active: true,
        title: 'Scheduled maintenance',
        message: 'CoE-NNECT is down for upgrades.',
      },
    );

    await expect(
      service.login('head@wmsu.edu.ph', 'correct-password'),
    ).rejects.toThrow('CoE-NNECT is down for upgrades.');
  });
});
