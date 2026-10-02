import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupabaseService } from '../../database/supabase.service';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private supabase: SupabaseService,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto): Promise<User> {
    // 1. Check for existing email in our public.users
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    // 2. Enforce single-Dean rule
    if (dto.role === 'college_dean') {
      const activeDean = await this.userRepo.findOne({
        where: { role: 'college_dean', isActive: true },
      });
      if (activeDean) {
        throw new ConflictException(
          'An active College Dean already exists. Deactivate the current Dean first.',
        );
      }
    }

    // 3. Create the Supabase Auth user
    const { data, error } = await this.supabase.getAdminClient().auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
      app_metadata: {
        role: dto.role,
        username: dto.username,
        dept_id: dto.deptId ?? null,
        faculty_id: dto.facultyId ?? null,
      },
    });

    if (error) throw new ConflictException(error.message);
    if (!data.user) throw new Error('Supabase did not return a user');

    // 4. The DB trigger `handle_new_auth_user` will insert into public.users.
    //    Fetch the row to return it.
    const profile = await this.userRepo.findOne({
      where: { userId: data.user.id },
    });

    if (!profile) {
      // Fallback: if the trigger didn't fire, create manually
      const fallback = this.userRepo.create({
        userId: data.user.id,
        username: dto.username,
        email: dto.email,
        role: dto.role as any,
        deptId: dto.deptId ?? null,
        facultyId: dto.facultyId ?? null,
        isActive: true,
      });
      return this.userRepo.save(fallback);
    }

    return profile;
  }

  async toggleActive(userId: string): Promise<User> {
    const user = await this.findOne(userId);
    user.isActive = !user.isActive;
    return this.userRepo.save(user);
  }

  async remove(userId: string): Promise<void> {
    const user = await this.findOne(userId);

    // Delete from Supabase Auth (cascades to public.users via FK)
    const { error } = await this.supabase
      .getAdminClient()
      .auth.admin.deleteUser(userId);

    if (error) throw new Error(`Failed to delete auth user: ${error.message}`);
  }
}