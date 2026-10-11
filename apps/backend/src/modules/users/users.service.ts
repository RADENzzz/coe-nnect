import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';  
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupabaseService } from '../../database/supabase.service';
import { User } from './entities/user.entity';
import { Department } from '../departments/entities/department.entity';
import { Faculty } from '../faculty/entities/faculty.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private supabase: SupabaseService,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Department) private deptRepo: Repository<Department>,
    @InjectRepository(Faculty) private facultyRepo: Repository<Faculty>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userRepo.find({ order: { createdAt: 'DESC' } });
  }

    /**
   * Presence-safe directory for non-admin roles (Dean, DH).
   * Returns ONLY the fields those dashboards need:
   *   - user_id, username, role, dept_id, is_active
   * Excludes email, employee IDs, WMSU IDs, faculty_id — no PII leak.
   * Uses snake_case to match the presence payload from Supabase Realtime.
   */
  async findDirectory() {
    const users = await this.userRepo.find({
      where: { isActive: true },
      select: ['userId', 'username', 'role', 'deptId'],
      order: { username: 'ASC' },
    });

    return users.map((u) => ({
      user_id: u.userId,
      username: u.username,
      role: u.role,
      dept_id: u.deptId,
      is_active: true,
    }));
  }

  async findOne(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Builds the app_metadata object for Supabase Auth.
   * The frontend's AuthProvider reads these fields as a fallback when the
   * full DB profile can't be fetched yet (RLS or timing), so we include
   * dept_code / dept_name / first_name here.
   */
  private async buildAppMetadata(opts: {
    role: string;
    username: string;
    deptId: string | null;
    facultyId: string | null;
  }) {
    const dept = opts.deptId
      ? await this.deptRepo.findOne({ where: { deptId: opts.deptId } })
      : null;

    const faculty = opts.facultyId
      ? await this.facultyRepo.findOne({
          where: { facultyId: opts.facultyId },
        })
      : null;

    return {
      role: opts.role,
      username: opts.username,
      dept_id: opts.deptId ?? null,
      dept_code: dept?.deptCode ?? null,
      dept_name: dept?.deptName ?? null,
      faculty_id: opts.facultyId ?? null,
      first_name: faculty?.firstName ?? opts.username,
    };
  }

  async create(dto: CreateUserDto): Promise<User> {
    // 1. Check for existing email in our public.users
    const existing = await this.userRepo.findOne({
      where: { email: dto.email },
    });
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

    if (dto.role === 'department_head' && !dto.deptId) {
      throw new ConflictException(
        'Department Heads must be assigned to a department.',
      );
    }

    // 3. Build app_metadata with the extra display fields
    const appMetadata = await this.buildAppMetadata({
      role: dto.role,
      username: dto.username,
      deptId: dto.deptId ?? null,
      facultyId: dto.facultyId ?? null,
    });

    // 4. Create the Supabase Auth user
    const { data, error } = await this.supabase
      .getAdminClient()
      .auth.admin.createUser({
        email: dto.email,
        password: dto.password,
        email_confirm: true,
        app_metadata: appMetadata,
      });

    if (error) throw new ConflictException(error.message);
    if (!data.user) throw new Error('Supabase did not return a user');

    // 5. The DB trigger `handle_new_auth_user` will insert into public.users.
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

  async update(userId: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(userId);

    // Single-dean rule: if promoting to college_dean, ensure no other active dean.
    if (
      dto.role === 'college_dean' &&
      user.role !== 'college_dean' &&
      user.isActive
    ) {
      const activeDean = await this.userRepo.findOne({
        where: { role: 'college_dean', isActive: true },
      });
      if (activeDean && activeDean.userId !== userId) {
        throw new ConflictException(
          'An active College Dean already exists. Deactivate the current Dean first.',
        );
      }
    }

    // Department is required for department heads.
    const finalRole = dto.role ?? user.role;
    const finalDeptId =
      dto.deptId !== undefined ? dto.deptId : user.deptId;
    if (finalRole === 'department_head' && !finalDeptId) {
      throw new ConflictException(
        'Department Heads must be assigned to a department.',
      );
    }

    // Apply changes to public.users
    if (dto.username !== undefined) user.username = dto.username;
    if (dto.role !== undefined) user.role = dto.role as any;
    if (dto.deptId !== undefined) user.deptId = dto.deptId || null;
    if (dto.facultyId !== undefined) user.facultyId = dto.facultyId || null;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;

    const saved = await this.userRepo.save(user);

    // Sync app_metadata so the next login carries the correct role/dept
    const appMetadata = await this.buildAppMetadata({
      role: saved.role,
      username: saved.username,
      deptId: saved.deptId ?? null,
      facultyId: saved.facultyId ?? null,
    });

    const { error } = await this.supabase
      .getAdminClient()
      .auth.admin.updateUserById(userId, {
        app_metadata: appMetadata,
      });

    if (error) {
      // Log but don't fail the whole operation — the DB row was already updated.
      this.logger.warn(
        `Failed to sync app_metadata for ${userId}: ${error.message}`,
      );
    }

    return saved;
  }
}