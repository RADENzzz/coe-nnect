import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, QueryFailedError, Repository } from 'typeorm';
import { Program } from './entities/program.entity';
import { CreateProgramDto } from './dto/create-program.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { DepartmentsService } from '../departments/departments.service';

const PG_UNIQUE_VIOLATION = '23505';

/**
 * Minimal shape of the authenticated caller. The controller builds this
 * from `req.profile`, which RolesGuard attaches for every write route.
 */
export interface ProgramCaller {
  role: string;
  deptId: string | null;
}

/**
 * Program (degree program) management.
 *
 *   - College Dean can manage programs in any department.
 *   - Department Head can only manage programs in their own department.
 *   - Deletion is intentionally not exposed: prospectus entries cascade
 *     on delete, so programs are deactivated instead.
 */
@Injectable()
export class ProgramsService {
  constructor(
    @InjectRepository(Program)
    private readonly repo: Repository<Program>,
    private readonly departments: DepartmentsService,
  ) {}

  /** Active programs only — what every picker/dropdown consumes. */
  findActive(): Promise<Program[]> {
    return this.repo.find({
      where: { isActive: true },
      order: { programCode: 'ASC' },
    });
  }

  /** Every program, including deactivated ones — the management page. */
  findAll(): Promise<Program[]> {
    return this.repo.find({ order: { programCode: 'ASC' } });
  }

  async findOne(id: string): Promise<Program> {
    const found = await this.repo.findOne({ where: { programId: id } });
    if (!found) throw new NotFoundException('Program not found');
    return found;
  }

  async create(dto: CreateProgramDto, caller: ProgramCaller): Promise<Program> {
    this.assertCanManage(caller);

    const deptId = this.resolveDeptId(dto.deptId, caller);
    await this.departments.assertDepartmentActive(deptId);

    const programCode = this.normalizeCode(dto.programCode);
    const programName = this.normalizeName(dto.programName);
    await this.assertCodeAvailable(programCode);

    const entity = this.repo.create({
      programCode,
      programName,
      deptId,
      isActive: dto.isActive ?? true,
    });

    return this.save(entity);
  }

  async update(
    id: string,
    dto: UpdateProgramDto,
    caller: ProgramCaller,
  ): Promise<Program> {
    this.assertCanManage(caller);
    const program = await this.findOne(id);
    this.assertOwnership(program, caller);

    if (dto.deptId !== undefined) {
      const targetDept = this.resolveDeptId(dto.deptId, caller);
      await this.departments.assertDepartmentActive(targetDept);
      program.deptId = targetDept;
    }

    if (dto.programCode !== undefined) {
      const programCode = this.normalizeCode(dto.programCode);
      await this.assertCodeAvailable(programCode, program.programId);
      program.programCode = programCode;
    }

    if (dto.programName !== undefined) {
      program.programName = this.normalizeName(dto.programName);
    }

    if (dto.isActive !== undefined) {
      program.isActive = dto.isActive;
    }

    return this.save(program);
  }

  async toggleActive(id: string, caller: ProgramCaller): Promise<Program> {
    this.assertCanManage(caller);
    const program = await this.findOne(id);
    this.assertOwnership(program, caller);
    program.isActive = !program.isActive;
    return this.save(program);
  }

  // ── Helpers ───────────────────────────────────────────────

  private assertCanManage(caller: ProgramCaller): void {
    if (
      caller.role !== 'administrator' &&
      caller.role !== 'college_dean' &&
      caller.role !== 'department_head'
    ) {
      throw new ForbiddenException(
        'Only the college dean and department heads can manage programs.',
      );
    }
  }

  /**
   * Department heads are pinned to their own department; the dean picks
   * one explicitly. A DH with no department assigned cannot create
   * anything, because there is nowhere sensible to put it.
   */
  private resolveDeptId(
    requestedDeptId: string | undefined,
    caller: ProgramCaller,
  ): string {
    if (caller.role === 'department_head') {
      if (!caller.deptId) {
        throw new ForbiddenException(
          'Your account is not assigned to a department.',
        );
      }
      if (
        requestedDeptId !== undefined &&
        String(requestedDeptId) !== String(caller.deptId)
      ) {
        throw new ForbiddenException(
          'You can only manage programs in your own department.',
        );
      }
      return String(caller.deptId);
    }

    if (!requestedDeptId) {
      throw new BadRequestException('Department is required.');
    }
    return String(requestedDeptId);
  }

  /** A DH can never touch (or move) a program owned by another dept. */
  private assertOwnership(program: Program, caller: ProgramCaller): void {
    if (
      caller.role === 'department_head' &&
      String(program.deptId) !== String(caller.deptId)
    ) {
      throw new ForbiddenException(
        'You can only manage programs in your own department.',
      );
    }
  }

  private normalizeCode(code: string | undefined): string {
    const normalized = (code ?? '').trim().toUpperCase();
    if (!normalized) throw new BadRequestException('Program code is required.');
    return normalized;
  }

  private normalizeName(name: string | undefined): string {
    const normalized = (name ?? '').trim();
    if (!normalized) throw new BadRequestException('Program name is required.');
    return normalized;
  }

  /** Case-insensitive duplicate check so "BSIT" and "bsit" can't coexist. */
  private async assertCodeAvailable(
    programCode: string,
    ignoreProgramId?: string,
  ): Promise<void> {
    const existing = await this.repo.findOne({
      where: { programCode: ILike(programCode) },
    });
    if (existing && String(existing.programId) !== String(ignoreProgramId)) {
      throw new ConflictException(
        `Program code "${programCode}" already exists.`,
      );
    }
  }

  private async save(program: Program): Promise<Program> {
    try {
      return await this.repo.save(program);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as any).driverError?.code === PG_UNIQUE_VIOLATION
      ) {
        throw new ConflictException(
          `Program code "${program.programCode}" already exists.`,
        );
      }
      throw err;
    }
  }
}
