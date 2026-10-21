import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SchedulingController } from '../src/modules/scheduling/scheduling.controller';
import { SchedulingService } from '../src/modules/scheduling/scheduling.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { SupabaseService } from '../src/database/supabase.service';
import { User } from '../src/modules/users/entities/user.entity';
import { createFakeSupabase } from './fakes/supabase.fake';
import { createTestApp } from './helpers/create-test-app';
import { departmentHeadProfile } from './helpers/profiles';

describe('SchedulingController (e2e)', () => {
  let app: INestApplication;
  const userRepo = { findOne: jest.fn() };
  const schedulingService = {
    plot: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    remove: jest.fn(),
  };

  beforeAll(async () => {
    app = await createTestApp({
      controllers: [SchedulingController],
      providers: [
        { provide: SchedulingService, useValue: schedulingService },
        { provide: SupabaseService, useValue: createFakeSupabase() },
        { provide: getRepositoryToken(User), useValue: userRepo },
        JwtAuthGuard,
        RolesGuard,
      ],
    });
  });

  beforeEach(() => {
    userRepo.findOne.mockReset();
    userRepo.findOne.mockResolvedValue(departmentHeadProfile);
    schedulingService.plot.mockReset();
    schedulingService.update.mockReset();
    schedulingService.updateStatus.mockReset();
    schedulingService.remove.mockReset();
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  it('plots a schedule entry with a valid payload', async () => {
    schedulingService.plot.mockResolvedValue({
      scheduleId: 'sched-1',
      status: 'draft',
    });

    const response = await api()
      .post('/v1/schedules/plot')
      .set('Authorization', 'Bearer valid-token')
      .send({
        termId: '1',
        subjectId: '10',
        facultyId: '5',
        roomId: '3',
        section: 'CpE-1A',
        loadType: 'lecture',
        dayOfWeek: 'Monday',
        startTime: '08:00',
        endTime: '09:00',
      })
      .expect(201);

    expect(response.body).toEqual({
      data: { scheduleId: 'sched-1', status: 'draft' },
    });
    expect(schedulingService.plot).toHaveBeenCalledWith(
      expect.objectContaining({
        termId: '1',
        subjectId: '10',
        facultyId: '5',
        dayOfWeek: 'Monday',
      }),
      departmentHeadProfile,
    );
  });

  it('updates a schedule entry', async () => {
    schedulingService.update.mockResolvedValue({
      scheduleId: 'sched-1',
      dayOfWeek: 'Tuesday',
    });

    const response = await api()
      .patch('/v1/schedules/sched-1')
      .set('Authorization', 'Bearer valid-token')
      .send({ dayOfWeek: 'Tuesday', startTime: '10:00', endTime: '11:00' })
      .expect(200);

    expect(response.body.data).toMatchObject({
      scheduleId: 'sched-1',
      dayOfWeek: 'Tuesday',
    });
    expect(schedulingService.update).toHaveBeenCalledWith(
      'sched-1',
      expect.objectContaining({ dayOfWeek: 'Tuesday' }),
      departmentHeadProfile,
    );
  });

  it('moves a schedule entry to review', async () => {
    schedulingService.updateStatus.mockResolvedValue({
      scheduleId: 'sched-1',
      status: 'review',
    });

    const response = await api()
      .patch('/v1/schedules/sched-1/status')
      .set('Authorization', 'Bearer valid-token')
      .send({ status: 'review' })
      .expect(200);

    expect(response.body.data).toMatchObject({ status: 'review' });
    expect(schedulingService.updateStatus).toHaveBeenCalledWith(
      'sched-1',
      'review',
      departmentHeadProfile,
    );
  });

  it('deletes a schedule entry', async () => {
    schedulingService.remove.mockResolvedValue({ success: true });

    const response = await api()
      .delete('/v1/schedules/sched-1')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(response.body).toEqual({ success: true });
    expect(schedulingService.remove).toHaveBeenCalledWith(
      'sched-1',
      departmentHeadProfile,
    );
  });
});
