import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SearchController } from '../src/modules/search/search.controller';
import { SearchService } from '../src/modules/search/search.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { SupabaseService } from '../src/database/supabase.service';
import { User } from '../src/modules/users/entities/user.entity';
import { createFakeSupabase } from './fakes/supabase.fake';
import { createTestApp } from './helpers/create-test-app';
import {
  deanProfile,
  departmentHeadProfile,
  inactiveProfile,
  viewerProfile,
} from './helpers/profiles';

describe('Role isolation (e2e)', () => {
  let app: INestApplication;
  const userRepo = { findOne: jest.fn() };
  const searchService = { search: jest.fn() };

  beforeAll(async () => {
    app = await createTestApp({
      controllers: [SearchController],
      providers: [
        { provide: SearchService, useValue: searchService },
        { provide: SupabaseService, useValue: createFakeSupabase() },
        { provide: getRepositoryToken(User), useValue: userRepo },
        JwtAuthGuard,
        RolesGuard,
      ],
    });
  });

  beforeEach(() => {
    userRepo.findOne.mockReset();
    searchService.search.mockReset();
    searchService.search.mockResolvedValue({ query: 'cs', results: [] });
  });

  afterAll(async () => {
    await app.close();
  });

  const getSearch = () =>
    request(app.getHttpServer())
      .get('/v1/search?q=cs')
      .set('Authorization', 'Bearer valid-token');

  it('allows a college dean to use the search endpoint', async () => {
    userRepo.findOne.mockResolvedValue(deanProfile);

    const response = await getSearch().expect(200);

    expect(response.body).toEqual({ query: 'cs', results: [] });
    expect(searchService.search).toHaveBeenCalledWith('cs', deanProfile, 20);
  });

  it('allows a department head and preserves their department context', async () => {
    userRepo.findOne.mockResolvedValue(departmentHeadProfile);

    await request(app.getHttpServer())
      .get('/v1/search?q=cs&limit=999')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(searchService.search).toHaveBeenCalledWith(
      'cs',
      departmentHeadProfile,
      50,
    );
  });

  it('denies viewers and inactive profiles before the service runs', async () => {
    userRepo.findOne.mockResolvedValueOnce(viewerProfile);
    await getSearch().expect(403);

    userRepo.findOne.mockResolvedValueOnce(inactiveProfile);
    await getSearch().expect(403);

    expect(searchService.search).not.toHaveBeenCalled();
  });
});
