import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ProgramsService } from '../src/modules/programs/programs.service';
import type { Program } from '../src/modules/programs/entities/program.entity';

const program = (overrides: Partial<Program> = {}): Program =>
  ({
    programId: '1',
    programCode: 'BSIT',
    programName: 'BS Information Technology',
    deptId: '7',
    isActive: true,
    ...overrides,
  }) as Program;

describe('ProgramsService', () => {
  let service: ProgramsService;
  let repo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let departments: { assertDepartmentActive: jest.Mock };

  beforeEach(() => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((input) => input),
      save: jest.fn(async (entity) => entity),
    };
    departments = {
      assertDepartmentActive: jest.fn().mockResolvedValue(undefined),
    };
    service = new ProgramsService(repo as any, departments as any);
  });

  describe('create', () => {
    it('pins a department head to their own department', async () => {
      repo.findOne.mockResolvedValue(null);

      const created = await service.create(
        {
          programCode: ' bsit ',
          programName: ' BS Information Technology ',
          deptId: '7',
        },
        { role: 'department_head', deptId: '7' },
      );

      expect(departments.assertDepartmentActive).toHaveBeenCalledWith('7');
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          programCode: 'BSIT',
          programName: 'BS Information Technology',
          deptId: '7',
          isActive: true,
        }),
      );
      expect(created.programCode).toBe('BSIT');
    });

    it('rejects a department head creating for another department', async () => {
      await expect(
        service.create(
          {
            programCode: 'BSIT',
            programName: 'BS Information Technology',
            deptId: '8',
          },
          { role: 'department_head', deptId: '7' },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects a duplicate program code', async () => {
      repo.findOne.mockResolvedValue(program());

      await expect(
        service.create(
          {
            programCode: 'BSIT',
            programName: 'Another name',
            deptId: '7',
          },
          { role: 'college_dean', deptId: null },
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(repo.save).not.toHaveBeenCalled();
    });

    it('requires a department for the dean', async () => {
      await expect(
        service.create(
          { programCode: 'BSIT', programName: 'BSIT', deptId: '' },
          { role: 'college_dean', deptId: null },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it('blocks a department head from editing another department', async () => {
      repo.findOne.mockResolvedValue(program({ deptId: '8' }));

      await expect(
        service.update(
          '1',
          { programName: 'Renamed' },
          { role: 'department_head', deptId: '7' },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('blocks a department head from moving a program', async () => {
      // First call loads the program, second is the duplicate check.
      repo.findOne.mockResolvedValueOnce(program({ deptId: '7' }));

      await expect(
        service.update(
          '1',
          { deptId: '8' },
          { role: 'department_head', deptId: '7' },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets the dean move a program to another department', async () => {
      repo.findOne
        .mockResolvedValueOnce(program({ deptId: '7' }))
        .mockResolvedValueOnce(null);

      const updated = await service.update(
        '1',
        { deptId: '9', programName: 'New Name' },
        { role: 'college_dean', deptId: null },
      );

      expect(departments.assertDepartmentActive).toHaveBeenCalledWith('9');
      expect(updated.deptId).toBe('9');
      expect(updated.programName).toBe('New Name');
    });
  });

  describe('toggleActive', () => {
    it('flips the active flag', async () => {
      repo.findOne.mockResolvedValue(program({ isActive: true }));

      const updated = await service.toggleActive('1', {
        role: 'college_dean',
        deptId: null,
      });

      expect(updated.isActive).toBe(false);
      expect(repo.save).toHaveBeenCalled();
    });

    it('blocks a department head from another department', async () => {
      repo.findOne.mockResolvedValue(program({ deptId: '8' }));

      await expect(
        service.toggleActive('1', {
          role: 'department_head',
          deptId: '7',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
