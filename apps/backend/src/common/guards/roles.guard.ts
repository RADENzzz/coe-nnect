import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ROLES_KEY, UserRole } from '../decorators/roles.decorator';
import { User } from '../../modules/users/entities/user.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();

    // 🔑 Skip OPTIONS preflight
    if (req.method === 'OPTIONS') {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const authUser = req.user;
    if (!authUser?.id) throw new ForbiddenException('Not authenticated');

    const profile = await this.userRepo.findOne({ where: { userId: authUser.id } });
    if (!profile || !profile.isActive) {
      throw new ForbiddenException('Profile not found or inactive');
    }

    if (!requiredRoles.includes(profile.role as UserRole)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    req.profile = profile;
    return true;
  }
}