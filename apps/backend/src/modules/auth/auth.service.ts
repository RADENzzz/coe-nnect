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
    });

    if (!profile) throw new UnauthorizedException('User profile not found');
    if (!profile.isActive) throw new UnauthorizedException('Account is deactivated');

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: {
        id: profile.userId,
        username: profile.username,
        email: profile.email,
        role: profile.role,
        deptId: profile.deptId,
        facultyId: profile.facultyId,
      },
    };
  }

  async getProfile(userId: string) {
    const profile = await this.userRepo.findOne({ where: { userId } });
    if (!profile) throw new UnauthorizedException('Profile not found');

    return {
      id: profile.userId,
      username: profile.username,
      email: profile.email,
      role: profile.role,
      deptId: profile.deptId,
      facultyId: profile.facultyId,
    };
  }
}