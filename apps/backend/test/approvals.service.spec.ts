import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApprovalsService } from '../src/modules/approvals/approvals.service';
import { createFakeRepository } from './fakes/repository.fake';

const pendingRequest = () => ({
  requestId: 'req-1',
  requestingDeptId: '1',
  targetDeptId: '2',
  facultyId: null,
  subjectId: '10',
  termId: '20',
  reason: 'Need faculty coverage',
  status: 'pending',
  createdBy: 'user-requester',
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  respondedBy: null,
  respondedAt: null,
  responseRemarks: null,
});

type PendingRequest = ReturnType<typeof pendingRequest>;

const users = [
  {
    userId: 'user-requester',
    username: 'requesting.head',
    email: 'requesting.head@wmsu.edu.ph',
    role: 'department_head',
    deptId: '1',
    isActive: true,
  },
  {
    userId: 'user-target',
    username: 'target.head',
    email: 'target.head@wmsu.edu.ph',
    role: 'department_head',
    deptId: '2',
    isActive: true,
  },
  {
    userId: 'user-dean',
    username: 'dean',
    email: 'dean@wmsu.edu.ph',
    role: 'college_dean',
    deptId: null,
    isActive: true,
  },
];

describe('ApprovalsService', () => {
  let service: ApprovalsService;
  let requestRepo: ReturnType<typeof createFakeRepository<PendingRequest>>;
  let dispatcher: { dispatch: jest.Mock };
  let recipients: {
    departmentHeadsOf: jest.Mock;
    collegeDean: jest.Mock;
    uniq: jest.Mock;
    departmentHeadsOfSchedule: jest.Mock;
  };
  let scheduleGateUpdate: jest.Mock;

  beforeEach(() => {
    requestRepo = createFakeRepository([pendingRequest()], {
      idKey: 'requestId',
    });
    const userRepo = createFakeRepository(users, { idKey: 'userId' });
    dispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) };
    recipients = {
      departmentHeadsOf: jest.fn(async (deptId: string) =>
        deptId === '2' ? ['user-target'] : ['user-requester'],
      ),
      collegeDean: jest.fn(async () => ['user-dean']),
      uniq: jest.fn((ids: string[]) => [...new Set(ids)]),
      departmentHeadsOfSchedule: jest.fn(async () => []),
    };
    scheduleGateUpdate = jest.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      getAdminClient: () => ({
        from: () => ({
          update: () => ({ eq: scheduleGateUpdate }),
        }),
      }),
    };

    service = new ApprovalsService(
      requestRepo as any,
      userRepo as any,
      dispatcher as any,
      recipients as any,
      supabase as any,
    );
  });

  it('creates a pending request and notifies the target department', async () => {
    requestRepo.create.mockImplementation((input: any) => ({
      ...input,
      requestId: 'req-new',
    }));

    const result = await service.create(
      {
        targetDeptId: '2',
        subjectId: '10',
        termId: '20',
        reason: 'Need faculty coverage',
      },
      'user-requester',
    );

    expect(result).toMatchObject({
      requestId: 'req-new',
      requestingDeptId: '1',
      targetDeptId: '2',
      status: 'pending',
      createdBy: 'user-requester',
    });
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      'request.submitted',
      expect.objectContaining({ entityId: 'req-new' }),
    );
  });

  it('lets the target department head approve and clears the schedule gate', async () => {
    const result = await service.approve(
      'req-1',
      { remarks: 'Approved for this term' },
      'user-target',
    );

    expect(result).toMatchObject({
      status: 'approved',
      respondedBy: 'user-target',
      responseRemarks: 'Approved for this term',
    });
    expect(scheduleGateUpdate).toHaveBeenCalledWith(
      'pending_faculty_request_id',
      'req-1',
    );
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      'request.approved',
      expect.objectContaining({ entityId: 'req-1' }),
    );
  });

  it('prevents the requesting department head from approving', async () => {
    await expect(
      service.approve('req-1', { remarks: 'Self approval' }, 'user-requester'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(requestRepo.save).not.toHaveBeenCalled();
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('requires remarks when rejecting a request', async () => {
    await expect(
      service.reject('req-1', {}, 'user-target'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(requestRepo.save).not.toHaveBeenCalled();
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });
});
