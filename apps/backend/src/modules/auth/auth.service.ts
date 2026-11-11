import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  isSupabaseAuthOutage,
  SupabaseService,
} from '../../database/supabase.service';
import { SystemStatusService } from '../system-status/system-status.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private supabase: SupabaseService,
    private systemStatus: SystemStatusService,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  async login(email: string, password: string) {
    const auth = this.supabase.getClient().auth;
    let result: Awaited<ReturnType<typeof auth.signInWithPassword>>;
    try {
      result = await auth.signInWithPassword({ email, password });
    } catch (err) {
      throw this.authProviderUnavailable(err);
    }

    const { data, error } = result;

    if (error || !data.session) {
      if (isSupabaseAuthOutage(error)) {
        throw this.authProviderUnavailable(error);
      }
      throw new UnauthorizedException(error?.message ?? 'Invalid credentials');
    }

    const profile = await this.userRepo.findOne({
      where: { userId: data.user.id },
      relations: ['department', 'faculty'],
    });

    if (!profile) throw new UnauthorizedException('User profile not found');
    if (!profile.isActive)
      throw new UnauthorizedException('Account is deactivated');

    // Maintenance mode: only the hidden developer account may sign in.
    const maintenance = await this.systemStatus.getMaintenanceNotice();
    if (maintenance.active && profile.role !== 'administrator') {
      throw new ServiceUnavailableException({
        code: 'MAINTENANCE_MODE',
        message:
          maintenance.message?.trim() ||
          maintenance.title?.trim() ||
          'CoE-NNECT is under maintenance. Please try again later.',
        title: maintenance.title ?? 'Under maintenance',
      });
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: this.serializeProfile(profile),
    };
  }

  /**
   * A network/provider failure while talking to Supabase is not a bad
   * password. Returning 401 for it would make the SPA treat the session as
   * expired, so report a retryable 503 instead.
   */
  private authProviderUnavailable(error: unknown): ServiceUnavailableException {
    const detail =
      error instanceof Error
        ? error.message
        : error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message)
          : String(error);
    this.logger.warn(`Supabase auth unavailable during login: ${detail}`);
    return new ServiceUnavailableException({
      code: 'AUTH_PROVIDER_UNAVAILABLE',
      message:
        'Authentication service is temporarily unreachable. Please try again in a moment.',
    });
  }

  async getProfile(userId: string) {
    const profile = await this.userRepo.findOne({
      where: { userId },
      relations: ['department', 'faculty'],
    });
    if (!profile) throw new UnauthorizedException('Profile not found');
    return this.serializeProfile(profile);
  }

  /**
   * Shapes the User entity into the response the frontend expects.
   *
   * `deptActive`:
   *   - true  → DH whose dept is active, or a Dean/Admin (never walled)
   *   - false → DH whose dept is inactive (frontend renders wall)
   *   - null  → no dept linked at all (data-integrity edge case)
   *
   * The frontend uses `profile.deptActive === false && role === 'department_head'`
   * as the sole "show wall" predicate.
   */
  private serializeProfile(profile: User) {
    const firstName =
      profile.faculty?.firstName ?? profile.username ?? 'User';

    // Dean/Admin are never walled — they need to see all departments to
    // reactivate one. Return true regardless of any dept.
    let deptActive: boolean | null = null;
    if (
      profile.role === 'college_dean' ||
      profile.role === 'college_secretary' ||
      profile.role === 'administrator'
    ) {
      deptActive = true;
    } else if (profile.department) {
      deptActive = profile.department.isActive === true;
    }

    return {
      id: profile.userId,
      username: profile.username,
      email: profile.email,
      role: profile.role,
      deptId: profile.deptId,
      deptCode: profile.department?.deptCode ?? null,
      deptName: profile.department?.deptName ?? null,
      deptActive,
      facultyId: profile.facultyId,
      firstName,
    };
  }
}