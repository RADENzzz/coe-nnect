import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupabaseService } from '../../database/supabase.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private supabase: SupabaseService,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  async login(email: string, password: string) {
    const { data, error } = await this.supabase
      .getClient()
      .auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      throw new UnauthorizedException(error?.message ?? 'Invalid credentials');
    }

    const profile = await this.userRepo.findOne({
      where: { userId: data.user.id },
      relations: ['department', 'faculty'],
    });

    if (!profile) throw new UnauthorizedException('User profile not found');
    if (!profile.isActive)
      throw new UnauthorizedException('Account is deactivated');

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: this.serializeProfile(profile),
    };
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
    if (profile.role === 'college_dean' || profile.role === 'administrator') {
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