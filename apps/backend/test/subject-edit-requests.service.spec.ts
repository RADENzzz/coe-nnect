import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { SubjectEditRequestsService } from '../src/modules/subjects/subject-edit-requests.service';
import { CreateSubjectEditRequestDto } from '../src/modules/subjects/dto/create-subject-edit-request.dto';
import { createFakeRepository } from './fakes/repository.fake';

const subjectRow = (overrides: Record<string, any> = {}) => ({
  subjectId: '1',
  subjectCode: 'CS 101',
  title: 'Programming',
  deptId: '7',
  isMinor: false,
  isActive: true,
  isPlaceholder: false,
  totalUnits: 3,
  ...overrides,
});

const requestRow = (overrides: Record<string, any> = {}) => ({
  requestId: 'r1',
  subjectId: '1',
  requestingDeptId: '9',
  owningDeptId: '7',
  reason: 'Need to maintain this subject',
  status: 'pending',
  createdBy: 'u-requester',
  respondedBy: null,
  respondedAt: null,
  responseRemarks: null,
  createdAt: new Date('2026-11-26T10:00:00Z'),
  updatedAt: new Date('2026-11-26T10:00:00Z'),
  ...overrides,
});

const admin = { userId: 'u-admin', role: 'administrator', deptId: null } as any;
const dean = { userId: 'u-dean', role: 'college_dean', deptId: null } as any;
const secretary = {
  userId: 'u-secretary',
  role: 'college_secretary',
  deptId: null,
} as any;
const ownerHead = {
  userId: 'u-owner',
  role: 'department_head',
  deptId: '7',
} as any;
const requesterHead = {
  userId: 'u-requester',
  role: 'department_head',
  deptId: '9',
} as any;
const otherHead = {
  userId: 'u-other',
  role: 'department_head',
  deptId: '11',
} as any;
const newOwnerHead = {
  userId: 'u-new-owner',
  role: 'department_head',
  deptId: '8',
} as any;
const headWithoutDept = {
  userId: 'u-no-dept',
  role: 'department_head',
  deptId: null,
} as any;

const deactivated = (deptId: string) =>
  new ConflictException(
    `Department ${deptId} is deactivated. Reactivate it before making changes.`,
  );

function createHarness(options: {
  subject?: Record<string, any> | null;
  requests?: Record<string, any>[];
  inactiveDepts?: string[];
  dispatch?: jest.Mock;
} = {}) {
  const subject =
    options.subject === undefined ? subjectRow() : options.subject;
  const subjectRepo = createFakeRepository(subject ? [subject] : [], {
    idKey: 'subjectId',
  });
  const requestRepo = createFakeRepository(options.requests ?? [], {
    idKey: 'requestId',
    autoId: true,
  });
  const inactiveDepts = (options.inactiveDepts ?? []).map(String);
  const departments = {
    assertDepartmentActive: jest.fn(async (deptId: unknown) => {
      if (deptId != null && inactiveDepts.includes(String(deptId))) {
        throw deactivated(String(deptId));
      }
    }),
  };
  const dispatch =
    options.dispatch ?? jest.fn().mockResolvedValue(undefined);
  const dispatcher = { dispatch };
  const recipients = {
    departmentHeadsOf: jest.fn(async (deptId: string) =>
      deptId === '7' ? ['u-owner'] : ['u-requester'],
    ),
    collegeDean: jest.fn().mockResolvedValue(['u-dean']),
    administrators: jest.fn().mockResolvedValue(['u-admin']),
    allDepartmentHeads: jest
      .fn()
      .mockResolvedValue(['u-owner', 'u-requester', 'u-other']),
    uniq: jest.fn((ids: Array<string | null | undefined>) =>
      Array.from(new Set(ids.filter((id): id is string => !!id))),
    ),
  };

  const service = new SubjectEditRequestsService(
    requestRepo as any,
    subjectRepo as any,
    departments as any,
    dispatcher as any,
    recipients as any,
  );

  return { service, requestRepo, subjectRepo, departments, dispatch };
}

describe('SubjectEditRequestsService', () => {
  describe('create request DTO', () => {
    it('rejects empty and whitespace-only reasons', async () => {
      for (const reason of ['', '   ', '\t\n']) {
        const errors = await validate(
          Object.assign(new CreateSubjectEditRequestDto(), { reason }),
        );
        expect(errors.some((e) => e.property === 'reason')).toBe(true);
      }
    });
  });

  describe('create', () => {
    it('allows one pending request per subject', async () => {
      const h = createHarness();
      await h.service.create('1', { reason: 'First request' }, requesterHead);

      const second = h.service.create('1', { reason: 'Second request' }, otherHead);
      await expect(second).rejects.toThrow(BadRequestException);
      await expect(second).rejects.toThrow(
        'An edit request for this subject is already pending.',
      );
      expect(h.requestRepo.rows).toHaveLength(1);
    });

    it.each([
      {
        name: 'college-wide role',
        profile: dean,
        subject: subjectRow(),
        inactiveDepts: [] as string[],
        error: ForbiddenException,
        message: 'College-wide roles do not need to request edit access.',
      },
      {
        name: 'own department',
        profile: ownerHead,
        subject: subjectRow(),
        inactiveDepts: [] as string[],
        error: BadRequestException,
        message: 'Target department must be different from yours',
      },
      {
        name: 'MINOR subject',
        profile: requesterHead,
        subject: subjectRow({ isMinor: true }),
        inactiveDepts: [] as string[],
        error: BadRequestException,
        message: 'MINOR subjects are shared and do not need edit requests.',
      },
      {
        name: 'inactive department',
        profile: requesterHead,
        subject: subjectRow(),
        inactiveDepts: ['9'],
        error: ConflictException,
        message: deactivated('9').message,
      },
    ])(
      'denies create for a college-wide role, own department, MINOR subject, or inactive department: $name',
      async ({ profile, subject, inactiveDepts, error, message }) => {
        const h = createHarness({ subject, inactiveDepts });

        await expect(
          h.service.create('1', { reason: 'Please allow edits' }, profile),
        ).rejects.toThrow(error);
        await expect(
          h.service.create('1', { reason: 'Please allow edits' }, profile),
        ).rejects.toThrow(message);
        expect(h.requestRepo.rows).toHaveLength(0);
      },
    );

    it('rejects a department head without a department', async () => {
      const h = createHarness();

      await expect(
        h.service.create('1', { reason: 'Please allow edits' }, headWithoutDept),
      ).rejects.toThrow(
        'You must belong to a department to make a request',
      );
    });

    it('rejects a request for a missing or inactive subject', async () => {
      const missing = createHarness({ subject: null });
      await expect(
        missing.service.create(
          '404',
          { reason: 'Please allow edits' },
          requesterHead,
        ),
      ).rejects.toThrow(NotFoundException);

      const inactive = createHarness({ subject: subjectRow({ isActive: false }) });
      await expect(
        inactive.service.create(
          '1',
          { reason: 'Please allow edits' },
          requesterHead,
        ),
      ).rejects.toThrow('Only active subjects can be requested for edit access.');
    });

    it('rejects a blank or whitespace-only reason without saving a request', async () => {
      const h = createHarness();

      await expect(
        h.service.create('1', { reason: '   ' }, requesterHead),
      ).rejects.toThrow('A reason is required');
      expect(h.requestRepo.rows).toHaveLength(0);
    });

    it('keeps the request when notification delivery fails', async () => {
      const dispatch = jest.fn().mockRejectedValue(new Error('Delivery down'));
      const h = createHarness({ dispatch });

      const saved = await h.service.create(
        '1',
        { reason: 'Please allow edits' },
        requesterHead,
      );

      expect(saved.status).toBe('pending');
      expect(h.requestRepo.rows).toHaveLength(1);
      expect(dispatch).toHaveBeenCalledWith(
        'subject_edit_request.submitted',
        expect.objectContaining({
          entityType: 'subject_edit_request',
          title: expect.stringContaining('CS 101'),
          payload: expect.objectContaining({
            subjectCode: 'CS 101',
            requestId: expect.any(String),
            subjectId: expect.any(String),
          }),
        }),
      );
    });
  });

  describe('respond', () => {
    it('lets the owning department head approve a pending request', async () => {
      const h = createHarness({ requests: [requestRow()] });

      const saved = await h.service.respond('r1', { action: 'approve' }, ownerHead);

      expect(saved.status).toBe('approved');
      expect(saved.respondedBy).toBe('u-owner');
      expect(saved.respondedAt).toBeInstanceOf(Date);
      expect(h.dispatch).toHaveBeenCalledWith(
        'subject_edit_request.approved',
        expect.objectContaining({ entityType: 'subject_edit_request' }),
      );
    });

    it('lets a college-wide role reject with remarks', async () => {
      const h = createHarness({ requests: [requestRow()] });

      const saved = await h.service.respond(
        'r1',
        { action: 'reject', remarks: 'Access not granted' },
        secretary,
      );

      expect(saved.status).toBe('rejected');
      expect(saved.responseRemarks).toBe('Access not granted');
      expect(h.dispatch).toHaveBeenCalledWith(
        'subject_edit_request.rejected',
        expect.any(Object),
      );
    });

    it('denies a response from a non-owning department head', async () => {
      const h = createHarness({ requests: [requestRow()] });

      await expect(
        h.service.respond('r1', { action: 'approve' }, otherHead),
      ).rejects.toThrow(
        'Only the owning department head or a college-wide role can respond to this request.',
      );
      expect(h.requestRepo.rows[0].status).toBe('pending');
    });

    it('also denies a response from the requesting department head', async () => {
      const h = createHarness({ requests: [requestRow()] });

      await expect(
        h.service.respond('r1', { action: 'approve' }, requesterHead),
      ).rejects.toThrow(ForbiddenException);
    });

    it('requires remarks to reject', async () => {
      const h = createHarness({ requests: [requestRow()] });

      await expect(
        h.service.respond('r1', { action: 'reject' }, ownerHead),
      ).rejects.toThrow('A rejection requires an explanation in remarks');
      expect(h.requestRepo.rows[0].status).toBe('pending');
    });

    it('refuses to respond to an already resolved request', async () => {
      const h = createHarness({
        requests: [requestRow({ status: 'rejected' })],
      });

      await expect(
        h.service.respond('r1', { action: 'approve' }, ownerHead),
      ).rejects.toThrow(
        'Request is already rejected and cannot be re-responded to',
      );
    });

    it('marks a revoke action as revoked and stops hasActiveGrant', async () => {
      const h = createHarness({
        requests: [
          requestRow({
            status: 'approved',
            respondedBy: 'u-owner',
            respondedAt: new Date('2026-11-25T10:00:00Z'),
          }),
        ],
      });
      expect(await h.service.hasActiveGrant('1', '9')).toBe(true);

      const saved = await h.service.respond(
        'r1',
        { action: 'revoke', remarks: 'Grant no longer needed' },
        ownerHead,
      );

      expect(saved.status).toBe('revoked');
      expect(saved.responseRemarks).toBe('Grant no longer needed');
      expect(await h.service.hasActiveGrant('1', '9')).toBe(false);
      expect(h.dispatch).toHaveBeenCalledWith(
        'subject_edit_request.revoked',
        expect.any(Object),
      );
    });

    it('rejects revoking a request that is not an approved grant', async () => {
      const h = createHarness({ requests: [requestRow()] });

      await expect(
        h.service.respond('r1', { action: 'revoke' }, ownerHead),
      ).rejects.toThrow('Only approved grants can be revoked.');
    });

    it('cancels a stale pending request when ownership changed before respond', async () => {
      const h = createHarness({
        subject: subjectRow({ deptId: '8' }),
        requests: [requestRow({ owningDeptId: '7' })],
      });

      const saved = await h.service.respond('r1', { action: 'approve' }, ownerHead);

      expect(saved.status).toBe('cancelled');
      expect(saved.responseRemarks).toBe(
        'Subject ownership changed before the request was resolved.',
      );
      expect(h.requestRepo.rows[0].status).toBe('cancelled');
      expect(await h.service.hasActiveGrant('1', '9')).toBe(false);
      expect(h.dispatch).toHaveBeenCalledWith(
        'subject_edit_request.cancelled',
        expect.any(Object),
      );
    });

    it('lets the current owning head close a stale pending request without granting access', async () => {
      const h = createHarness({
        subject: subjectRow({ deptId: '8' }),
        requests: [requestRow({ owningDeptId: '7' })],
      });

      const saved = await h.service.respond(
        'r1',
        { action: 'approve' },
        newOwnerHead,
      );

      expect(saved.status).toBe('cancelled');
      expect(saved.responseRemarks).toBe(
        'Subject ownership changed before the request was resolved.',
      );
      expect(h.requestRepo.rows[0].status).toBe('cancelled');
      expect(await h.service.hasActiveGrant('1', '9')).toBe(false);
      expect(h.dispatch).toHaveBeenCalledWith(
        'subject_edit_request.cancelled',
        expect.any(Object),
      );
      expect(h.dispatch).not.toHaveBeenCalledWith(
        'subject_edit_request.approved',
        expect.any(Object),
      );
    });

    it('lets a college-wide role close a stale pending request', async () => {
      const h = createHarness({
        subject: subjectRow({ deptId: '8' }),
        requests: [requestRow({ owningDeptId: '7' })],
      });

      const saved = await h.service.respond('r1', { action: 'approve' }, dean);

      expect(saved.status).toBe('cancelled');
      expect(h.requestRepo.rows[0].status).toBe('cancelled');
      expect(await h.service.hasActiveGrant('1', '9')).toBe(false);
    });

    it('still forbids an unrelated head from closing a stale pending request', async () => {
      const h = createHarness({
        subject: subjectRow({ deptId: '8' }),
        requests: [requestRow({ owningDeptId: '7' })],
      });

      await expect(
        h.service.respond('r1', { action: 'approve' }, otherHead),
      ).rejects.toThrow(ForbiddenException);
      expect(h.requestRepo.rows[0].status).toBe('pending');
    });

    it('cancels a stale pending request when the subject was deactivated', async () => {
      const h = createHarness({
        subject: subjectRow({ isActive: false }),
        requests: [requestRow()],
      });

      const saved = await h.service.respond('r1', { action: 'approve' }, ownerHead);

      expect(saved.status).toBe('cancelled');
      expect(h.requestRepo.rows[0].status).toBe('cancelled');
      expect(await h.service.hasActiveGrant('1', '9')).toBe(false);
    });

    it('keeps the response when notification delivery fails', async () => {
      const dispatch = jest.fn().mockRejectedValue(new Error('Delivery down'));
      const h = createHarness({ requests: [requestRow()], dispatch });

      const saved = await h.service.respond('r1', { action: 'approve' }, ownerHead);

      expect(saved.status).toBe('approved');
      expect(dispatch).toHaveBeenCalledWith(
        'subject_edit_request.approved',
        expect.any(Object),
      );
    });
  });

  describe('cancel', () => {
    it('lets the requesting department head cancel a pending request', async () => {
      const h = createHarness({ requests: [requestRow()] });

      const saved = await h.service.cancel('r1', requesterHead);

      expect(saved.status).toBe('cancelled');
      expect(saved.respondedBy).toBe('u-requester');
      expect(h.dispatch).toHaveBeenCalledWith(
        'subject_edit_request.cancelled',
        expect.any(Object),
      );
    });

    it('lets a college-wide role cancel a pending request', async () => {
      const h = createHarness({ requests: [requestRow()] });

      const saved = await h.service.cancel('r1', admin);

      expect(saved.status).toBe('cancelled');
      expect(saved.respondedBy).toBe('u-admin');
    });

    it('denies cancellation from the owning department head', async () => {
      const h = createHarness({ requests: [requestRow()] });

      await expect(h.service.cancel('r1', ownerHead)).rejects.toThrow(
        'Only the requesting department head or a college-wide role can cancel this request.',
      );
      expect(h.requestRepo.rows[0].status).toBe('pending');
    });

    it('refuses to cancel a resolved request', async () => {
      const h = createHarness({
        requests: [requestRow({ status: 'approved' })],
      });

      await expect(h.service.cancel('r1', requesterHead)).rejects.toThrow(
        'Only pending requests can be cancelled',
      );
    });
  });

  describe('visibility and grants', () => {
    it('returns the pending request before any approved grant for the drawer', async () => {
      const h = createHarness({
        requests: [
          requestRow({
            requestId: 'r-approved',
            status: 'approved',
            createdAt: new Date('2026-11-24T10:00:00Z'),
          }),
          requestRow({
            requestId: 'r-pending',
            status: 'pending',
            requestingDeptId: '11',
            createdAt: new Date('2026-11-25T10:00:00Z'),
          }),
        ],
      });

      const current = await h.service.findCurrentForSubject('1', ownerHead);

      expect(current?.requestId).toBe('r-pending');
    });

    it('shows a stale pending request to the new owner who can close it', async () => {
      const h = createHarness({
        subject: subjectRow({ deptId: '8' }),
        requests: [requestRow({ owningDeptId: '7' })],
      });

      expect(
        await h.service.findCurrentForSubject('1', newOwnerHead),
      ).toMatchObject({ requestId: 'r1', status: 'pending' });
      // Recorded-owner and college-wide visibility stay unchanged, and an
      // unrelated head still sees nothing.
      expect(
        await h.service.findCurrentForSubject('1', ownerHead),
      ).toMatchObject({ requestId: 'r1', status: 'pending' });
      expect(
        await h.service.findCurrentForSubject('1', dean),
      ).toMatchObject({ requestId: 'r1', status: 'pending' });
      expect(await h.service.findCurrentForSubject('1', otherHead)).toBeNull();

      const saved = await h.service.respond(
        'r1',
        { action: 'approve' },
        newOwnerHead,
      );

      expect(saved.status).toBe('cancelled');
      expect(saved.responseRemarks).toBe(
        'Subject ownership changed before the request was resolved.',
      );
      expect(await h.service.hasActiveGrant('1', '9')).toBe(false);
    });

    it('returns an active approved grant when no request is pending', async () => {
      const h = createHarness({
        requests: [requestRow({ status: 'approved' })],
      });

      const current = await h.service.findCurrentForSubject('1', requesterHead);

      expect(current?.requestId).toBe('r1');
      expect(current?.status).toBe('approved');
    });

    it('reports an approved grant only while status is approved and ownership is unchanged', async () => {
      const h = createHarness({
        requests: [requestRow({ status: 'approved' })],
      });
      expect(await h.service.hasActiveGrant('1', '9')).toBe(true);

      await h.service.respond('r1', { action: 'revoke' }, ownerHead);
      expect(await h.service.hasActiveGrant('1', '9')).toBe(false);

      const ownershipChanged = createHarness({
        subject: subjectRow({ deptId: '8' }),
        requests: [requestRow({ status: 'approved' })],
      });
      expect(await ownershipChanged.service.hasActiveGrant('1', '9')).toBe(false);
    });

    it('shows a department head only requests for their own or owned departments', async () => {
      const h = createHarness({
        requests: [
          requestRow({
            requestId: 'r1',
            createdAt: new Date('2026-11-21T10:00:00Z'),
          }),
          requestRow({
            requestId: 'r2',
            requestingDeptId: '11',
            createdAt: new Date('2026-11-23T10:00:00Z'),
          }),
          requestRow({
            requestId: 'r3',
            subjectId: '2',
            owningDeptId: '9',
            requestingDeptId: '13',
            createdAt: new Date('2026-11-22T10:00:00Z'),
          }),
        ],
      });

      const visible = await h.service.findVisible({}, requesterHead);

      expect(visible.map((r) => r.requestId)).toEqual(['r3', 'r1']);
    });

    it('shows every request to college-wide roles and honours filters', async () => {
      const h = createHarness({
        requests: [
          requestRow({
            requestId: 'r1',
            status: 'approved',
            createdAt: new Date('2026-11-25T10:00:00Z'),
          }),
          requestRow({
            requestId: 'r2',
            subjectId: '2',
            status: 'pending',
            createdAt: new Date('2026-11-26T10:00:00Z'),
          }),
        ],
      });

      const all = await h.service.findVisible({}, dean);
      expect(all.map((r) => r.requestId)).toEqual(['r2', 'r1']);

      const filtered = await h.service.findVisible(
        { status: 'pending', subjectId: '2' },
        dean,
      );
      expect(filtered.map((r) => r.requestId)).toEqual(['r2']);
    });

    it('hides requests from roles without department visibility', async () => {
      const h = createHarness({
        requests: [requestRow(), requestRow({ requestId: 'r2', subjectId: '2' })],
      });

      expect(await h.service.findVisible({}, ownerHead)).toHaveLength(2);
      expect(await h.service.findVisible({}, otherHead)).toHaveLength(0);
    });

    it('revokes approved grants for the old owner', async () => {
      const h = createHarness({
        requests: [
          requestRow({ requestId: 'r1', status: 'approved' }),
          requestRow({
            requestId: 'r2',
            requestingDeptId: '11',
            status: 'approved',
          }),
          requestRow({
            requestId: 'r3',
            owningDeptId: '8',
            requestingDeptId: '13',
            status: 'approved',
          }),
        ],
      });

      await h.service.revokeGrantsForOwner('1', '7');

      expect(
        h.requestRepo.rows.map((r) => [r.requestId, r.status]),
      ).toEqual([
        ['r1', 'revoked'],
        ['r2', 'revoked'],
        ['r3', 'approved'],
      ]);
      expect(await h.service.hasActiveGrant('1', '9')).toBe(false);
      expect(h.dispatch).toHaveBeenCalledWith(
        'subject_edit_request.revoked',
        expect.any(Object),
      );
    });
  });
});
