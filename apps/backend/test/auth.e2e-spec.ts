import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { SupabaseService } from '../src/database/supabase.service';
import { createFakeSupabase } from './fakes/supabase.fake';
import { createTestApp } from './helpers/create-test-app';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  const authService = {
    login: jest.fn(),
    getProfile: jest.fn(),
  };
  const fakeSupabase = createFakeSupabase();

  beforeAll(async () => {
    app = await createTestApp({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: SupabaseService, useValue: fakeSupabase },
        JwtAuthGuard,
      ],
    });
  });

  beforeEach(() => {
    authService.login.mockReset();
    authService.getProfile.mockReset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the session payload for valid credentials', async () => {
    authService.login.mockResolvedValueOnce({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { id: 'user-1', role: 'college_dean' },
    });

    const response = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({
        email: 'dean@wmsu.edu.ph',
        password: 'Demo!2345',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { id: 'user-1', role: 'college_dean' },
    });
    expect(authService.login).toHaveBeenCalledWith(
      'dean@wmsu.edu.ph',
      'Demo!2345',
    );
  });

  it('rejects malformed login input before calling the service', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({
        email: 'not-an-email',
        password: '123',
      })
      .expect(400);

    expect(authService.login).not.toHaveBeenCalled();
  });

  it('rejects /me requests without a bearer token', async () => {
    await request(app.getHttpServer()).get('/v1/auth/me').expect(401);

    expect(authService.getProfile).not.toHaveBeenCalled();
  });

  it('resolves the profile for an authenticated request', async () => {
    authService.getProfile.mockResolvedValueOnce({
      id: 'user-1',
      role: 'college_dean',
      firstName: 'Ada',
    });

    const response = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(response.body).toMatchObject({
      id: 'user-1',
      role: 'college_dean',
    });
    expect(authService.getProfile).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
    );
  });
});
