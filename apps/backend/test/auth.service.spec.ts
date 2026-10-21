import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../src/modules/auth/auth.service';
import { createFakeRepository } from './fakes/repository.fake';

function createService(
  signInResult: any,
  profiles: Record<string, any>[] = [],
) {
  const supabase = {
    getClient: () => ({
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue(signInResult),
      },
    }),
  };
  const userRepo = createFakeRepository(profiles, { idKey: 'userId' });
  return {
    service: new AuthService(supabase as any, userRepo as any),
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
});
