import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupabaseService } from '../../database/supabase.service';
import { Department } from '../departments/entities/department.entity';
import { Faculty } from '../faculty/entities/faculty.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { NotificationDispatcherService } from '../notifications/notification-dispatcher.service';
import { RecipientsService } from '../notifications/recipients.service';
import { User, UserRole } from './entities/user.entity';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private supabase: SupabaseService,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Department) private deptRepo: Repository<Department>,
    @InjectRepository(Faculty) private facultyRepo: Repository<Faculty>,
    private readonly dispatcher: NotificationDispatcherService,
    private readonly recipients: RecipientsService,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userRepo.find({ order: { createdAt: 'DESC' } });
  }

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

  /**
   * Create a user.
   *
   * `actingUserId` is the admin performing the action. Used for the
   * `user.created` notification so we can exclude the creator from
   * the recipients list (they already know).
   */
  async create(dto: CreateUserDto, actingUserId?: string): Promise<User> {
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

    // 3. Build app_metadata
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

    // 5. Fetch the profile the trigger created, or fall back to manual
    let saved: User;
    const profile = await this.userRepo.findOne({
      where: { userId: data.user.id },
    });

    if (!profile) {
      const fallback = this.userRepo.create({
        userId: data.user.id,
        username: dto.username,
        email: dto.email,
        role: dto.role as UserRole,
        deptId: dto.deptId ?? null,
        facultyId: dto.facultyId ?? null,
        isActive: true,
      });
      saved = await this.userRepo.save(fallback);
    } else {
      saved = profile;
    }

    // ═══ Notification: user.created (to admins, excluding the actor) ═══
    const admins = await this.recipients.administrators();
    const recipients = actingUserId
      ? admins.filter((id) => id !== actingUserId)
      : admins;

    await this.dispatcher.dispatch('user.created', {
      recipientUserIds: recipients,
      title: 'User account created',
      body: `${saved.username} was created with role ${saved.role}.`,
      entityType: 'user',
      entityId: String(saved.userId),
      payload: {
        role: saved.role,
        deptId: saved.deptId ?? null,
        createdBy: actingUserId ?? null,
      },
    });

    return saved;
  }

  /**
   * Toggle is_active. `actingUserId` is the admin performing the action.
   */
  async toggleActive(userId: string, actingUserId?: string): Promise<User> {
    const user = await this.findOne(userId);
    user.isActive = !user.isActive;
    const saved = await this.userRepo.save(user);

    // ═══ Notification: user.deactivated (only when transitioning to inactive) ═══
    if (saved.isActive === false) {
      const admins = await this.recipients.administrators();
      const recipients = actingUserId
        ? admins.filter((id) => id !== actingUserId)
        : admins;

      await this.dispatcher.dispatch('user.deactivated', {
        recipientUserIds: recipients,
        title: 'User account deactivated',
        body: `${saved.username} was deactivated.`,
        entityType: 'user',
        entityId: String(saved.userId),
        payload: {
          role: saved.role,
          deptId: saved.deptId ?? null,
          deactivatedBy: actingUserId ?? null,
        },
      });
    }

    return saved;
  }

  async remove(userId: string): Promise<void> {
    const user = await this.findOne(userId);

    const { error } = await this.supabase
      .getAdminClient()
      .auth.admin.deleteUser(userId);

    if (error) throw new Error(`Failed to delete auth user: ${error.message}`);
  }

  async update(userId: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(userId);

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

    const finalRole = dto.role ?? user.role;
    const finalDeptId =
      dto.deptId !== undefined ? dto.deptId : user.deptId;
    if (finalRole === 'department_head' && !finalDeptId) {
      throw new ConflictException(
        'Department Heads must be assigned to a department.',
      );
    }

    if (dto.username !== undefined) user.username = dto.username;
    if (dto.role !== undefined) user.role = dto.role as any;
    if (dto.deptId !== undefined) user.deptId = dto.deptId || null;
    if (dto.facultyId !== undefined) user.facultyId = dto.facultyId || null;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;

    const saved = await this.userRepo.save(user);

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
      this.logger.warn(
        `Failed to sync app_metadata for ${userId}: ${error.message}`,
      );
    }

    return saved;
  }
    /**
   * True if the user holds the hidden dev-only `administrator` role.
   *
   * This exists so services can distinguish "actual dev account" from
   * "Dean acting as top role" — they are deliberately not the same.
   * Do NOT use this to gate normal business logic; use
   * `role === 'college_dean'` for that. This is only for dev-tooling
   * paths (demo reset, seed, etc.).
   */
  isDevAccount(user: Pick<User, 'role'>): boolean {
    return user.role === 'administrator';
  }
}