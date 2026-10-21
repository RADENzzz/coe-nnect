import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Department } from '../../modules/departments/entities/department.entity';
import { User } from '../../modules/users/entities/user.entity';
import { SKIP_DEPT_ACTIVE_KEY } from '../decorators/skip-dept-active.decorator';

@Injectable()
export class DepartmentActiveGuard implements CanActivate {
  private readonly logger = new Logger(DepartmentActiveGuard.name);

  private readonly cache = new Map<
    string,
    { isActive: boolean; checkedAt: number; code: string; name: string }
  >();
  private readonly TTL_MS = 30_000;

  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(Department)
    private readonly deptRepo: Repository<Department>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    if (req.method === 'OPTIONS') return true;

    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_DEPT_ACTIVE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (skip) return true;

    // Global guards run BEFORE controller guards, so req.profile is
    // usually unpopulated here. If the request is unauthenticated, let
    // JwtAuthGuard handle it (it runs after us and will reject).
    const authUser = req.user;
    if (!authUser?.id) return true; // no token — deferred to JwtAuthGuard

    // Resolve the profile. Prefer one that a previous guard already
    // populated (this is the fast path when the request reaches us a
    // second time or via a nested guard stack).
    let profile = req.profile as User | undefined;
    if (!profile) {
      profile = (await this.userRepo.findOne({
        where: { userId: authUser.id },
      })) ?? undefined;
      if (profile) req.profile = profile;
    }

    if (!profile) {
      // No profile at all — let RolesGuard 403 it with its own message.
      return true;
    }

    // Dean / administrator bypass
    if (
      profile.role === 'college_dean' ||
      profile.role === 'administrator'
    ) {
      return true;
    }
    if (profile.role !== 'department_head') return true;

    const deptId = profile.deptId != null ? String(profile.deptId) : null;
    if (!deptId) return true;

    const info = await this.getDeptStatus(deptId);
    if (!info) {
      throw new ForbiddenException({
        code: 'DEPARTMENT_NOT_FOUND',
        message:
          'Your department record is missing. Contact the College Dean.',
      });
    }

    if (!info.isActive) {
      this.logger.warn(
        `Blocked request from DH in deactivated dept=${deptId} (${info.code}): ${req.method} ${req.originalUrl ?? req.url}`,
      );
      throw new ForbiddenException({
        code: 'DEPARTMENT_INACTIVE',
        message:
          `Department "${info.code} — ${info.name}" is deactivated. ` +
          `Contact the College Dean to reactivate it before making any changes.`,
      });
    }

    return true;
  }

  private async getDeptStatus(deptId: string): Promise<
    { isActive: boolean; code: string; name: string } | null
  > {
    const hit = this.cache.get(deptId);
    if (hit && Date.now() - hit.checkedAt < this.TTL_MS) {
      return { isActive: hit.isActive, code: hit.code, name: hit.name };
    }

    const dept = await this.deptRepo.findOne({
      where: { deptId },
      select: ['deptId', 'deptCode', 'deptName', 'isActive'],
    });
    if (!dept) return null;

    this.cache.set(deptId, {
      isActive: dept.isActive,
      code: dept.deptCode,
      name: dept.deptName,
      checkedAt: Date.now(),
    });
    return {
      isActive: dept.isActive,
      code: dept.deptCode,
      name: dept.deptName,
    };
  }

  invalidate(deptId: string) {
    this.cache.delete(String(deptId));
  }
}