import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SupabaseService } from '../../database/supabase.service';
import { Department } from '../departments/entities/department.entity';
import { Faculty } from '../faculty/entities/faculty.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { NotificationDispatcherService } from '../notifications/notification-dispatcher.service';
import { RecipientsService } from '../notifications/recipients.service';
import { User, UserRole } from './entities/user.entity';
import { UserPresence } from './entities/user-presence.entity';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  /**
   * In-memory rate limit for self-service password changes.
   */
  private readonly changePasswordAttempts = new Map<string, number[]>();

  constructor(
    private supabase: SupabaseService,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(UserPresence)
    private presenceRepo: Repository<UserPresence>,
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

    const presence = users.length
      ? await this.presenceRepo.find({
          where: { userId: In(users.map((u) => u.userId)) },
        })
      : [];
    const lastSeenByUser = new Map(
      presence.map((p) => [p.userId, p.lastSeenAt]),
    );

    return users.map((u) => ({
      user_id: u.userId,
      username: u.username,
      role: u.role,
      dept_id: u.deptId,
      is_active: true,
      last_seen_at: lastSeenByUser.get(u.userId)?.toISOString() ?? null,
    }));
  }

  /**
   * Record that the signed-in user's browser is still around.
   *
   * Upsert keeps this to one row per user. The write is deliberately cheap:
   * the frontend calls it once a minute, and it must never touch `users` or
   * its `updated_at` trigger.
   */
  async heartbeat(userId: string): Promise<{ last_seen_at: string }> {
    const now = new Date();
    await this.presenceRepo.upsert(
      { userId, lastSeenAt: now },
      { conflictPaths: ['userId'] },
    );
    return { last_seen_at: now.toISOString() };
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
        user_metadata: {
          role: dto.role,
          username: dto.username,
          dept_id: dto.deptId ?? null,
          faculty_id: dto.facultyId ?? null,
        },
      });

    if (error) throw new ConflictException(error.message);
    if (!data.user) throw new Error('Supabase did not return a user');
    // 5. Reconcile the profile row with what we actually requested.
    //
    // The `on_auth_user_created` trigger inserts into public.users using
    // `raw_app_meta_data->>'role'`, falling back to 'viewer'. Supabase
    // does NOT guarantee app_metadata is present in raw_app_meta_data at
    // the exact moment the AFTER INSERT trigger fires, so the trigger
    // intermittently writes 'viewer' even though we passed the correct
    // role to admin.createUser(). Force the intended values through so
    // the row always matches the API contract.
    let saved: User;
    const profile = await this.userRepo.findOne({
      where: { userId: data.user.id },
    });

    if (!profile) {
      // Trigger didn't run (or was disabled) — insert ourselves.
      saved = await this.userRepo.save(
        this.userRepo.create({
          userId: data.user.id,
          username: dto.username,
          email: dto.email,
          role: dto.role as UserRole,
          deptId: dto.deptId ?? null,
          facultyId: dto.facultyId ?? null,
          isActive: true,
        }),
      );
    } else {
      // Trigger ran, but possibly with stale/empty metadata. Reconcile.
      let dirty = false;
      const intendedRole = dto.role as UserRole;
      const intendedDeptId = dto.deptId ?? null;
      const intendedFacultyId = dto.facultyId ?? null;

      if (profile.role !== intendedRole) {
        profile.role = intendedRole;
        dirty = true;
      }
      if (profile.username !== dto.username) {
        profile.username = dto.username;
        dirty = true;
      }
      if ((profile.deptId ?? null) !== intendedDeptId) {
        profile.deptId = intendedDeptId;
        dirty = true;
      }
      if ((profile.facultyId ?? null) !== intendedFacultyId) {
        profile.facultyId = intendedFacultyId;
        dirty = true;
      }

      saved = dirty ? await this.userRepo.save(profile) : profile;
    }

    // ═══ Notification: user.created ═══
    const admins = await this.recipients.administrators();
    const recipients = actingUserId
      ? admins.filter((id) => id !== actingUserId)
      : admins;

    const dept = saved.deptId
      ? await this.deptRepo.findOne({ where: { deptId: saved.deptId } })
      : null;

    await this.dispatcher.dispatch('user.created', {
      recipientUserIds: recipients,
      title: `User account created: ${saved.username}`,
      body:
        `${saved.username} (${saved.role.replace(/_/g, ' ')}) was created` +
        (dept?.deptCode ? ` in ${dept.deptCode}.` : '.'),
      entityType: 'user',
      entityId: String(saved.userId),
      payload: {
        role: saved.role,
        deptId: saved.deptId ?? null,
        deptCode: dept?.deptCode ?? null,
        deptName: dept?.deptName ?? null,
        email: saved.email,
        createdBy: actingUserId ?? null,
      },
    });

    return saved;
  }

  /**
   * Toggle is_active. `actingUserId` is the admin performing the action.
   */
  async toggleActive(userId: string, actingUserId?: string): Promise<User> {
    if (actingUserId && userId === actingUserId) {
      throw new ConflictException(
        'You cannot deactivate your own account.',
      );
    }

    const user = await this.findOne(userId);
    user.isActive = !user.isActive;
    const saved = await this.userRepo.save(user)

    // ── Sync with Supabase Auth ──
    // If deactivated, ban the user so they cannot log in via Supabase.
    // If activated, remove the ban.
    try {
      const { error } = await this.supabase
        .getAdminClient()
        .auth.admin.updateUserById(userId, {
          // '876000h' = 100 years. Supabase enforces this at the Auth layer.
          ban_duration: saved.isActive ? 'none' : '876000h',
        });
      
      if (error) {
        this.logger.warn(
          `Failed to sync ban status for ${userId}: ${error.message}`,
        );
      } else {
        this.logger.log(
          `Synced Supabase ban status for ${userId} (isActive: ${saved.isActive})`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Unexpected error syncing ban status for ${userId}`,
        err,
      );
    }

    // ═══ Notification: user.deactivated ═══
    if (saved.isActive === false) {
      const admins = await this.recipients.administrators();
      const recipients = actingUserId
        ? admins.filter((id) => id !== actingUserId)
        : admins;

      const dept = saved.deptId
        ? await this.deptRepo.findOne({ where: { deptId: saved.deptId } })
        : null;

      await this.dispatcher.dispatch('user.deactivated', {
        recipientUserIds: recipients,
        title: `User account deactivated: ${saved.username}`,
        body:
          `${saved.username} (${saved.role.replace(/_/g, ' ')}) was deactivated` +
          (dept?.deptCode ? ` · ${dept.deptCode}.` : '.'),
        entityType: 'user',
        entityId: String(saved.userId),
        payload: {
          role: saved.role,
          deptId: saved.deptId ?? null,
          deptCode: dept?.deptCode ?? null,
          deptName: dept?.deptName ?? null,
          email: saved.email,
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
    const finalDeptId = dto.deptId !== undefined ? dto.deptId : user.deptId;
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

    // ── Sync with Supabase Auth (app_metadata + ban status) ──
    try {
      const { error } = await this.supabase
        .getAdminClient()
        .auth.admin.updateUserById(userId, {
          app_metadata: appMetadata,
          // Just in case the user was deactivated via the Edit modal
          ban_duration: saved.isActive ? 'none' : '876000h',
        });

      if (error) {
        this.logger.warn(
          `Failed to sync app_metadata/ban for ${userId}: ${error.message}`,
        );
      }
    } catch (err) {
      this.logger.error(`Unexpected error syncing auth for ${userId}`, err);
    }

    return saved;
  }

  // ════════════════════════════════════════════
  // SELF-SERVICE PASSWORD CHANGE
  // ════════════════════════════════════════════

  async changeOwnPassword(
    userId: string,
    userEmail: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: true }> {
    // ── Rate limit: 5 attempts per user per 5 min ──
    const key = `pwd:${userId}`;
    const now = Date.now();
    const FIVE_MIN = 5 * 60 * 1000;
    const bucket = (this.changePasswordAttempts.get(key) ?? []).filter(
      (t) => now - t < FIVE_MIN,
    );

    if (bucket.length >= 5) {
      throw new BadRequestException(
        'Too many password change attempts. Try again in a few minutes.',
      );
    }

    // ── Re-authenticate ──
    const { data: signIn, error: signInErr } = await this.supabase
      .getAdminClient()
      .auth.signInWithPassword({
        email: userEmail,
        password: currentPassword,
      });

    if (signInErr || !signIn.user) {
      bucket.push(now);
      this.changePasswordAttempts.set(key, bucket);
      this.logger.warn(
        `changeOwnPassword: re-auth failed for user=${userId} (attempt ${bucket.length}/5)`,
      );
      throw new UnauthorizedException('Current password is incorrect.');
    }

    // ── Update via admin client ──
    const { error: updateErr } = await this.supabase
      .getAdminClient()
      .auth.admin.updateUserById(userId, { password: newPassword });

    if (updateErr) {
      this.logger.error(
        `changeOwnPassword failed for user=${userId}: ${updateErr.message}`,
      );
      throw new BadRequestException(
        `Failed to update password: ${updateErr.message}`,
      );
    }

    // ── Clear rate limit on success ──
    this.changePasswordAttempts.delete(key);

    this.logger.log(`Password changed by user=${userId}`);
    return { success: true };
  }

  /**
   * True if the user holds the hidden dev-only `administrator` role.
   */
  isDevAccount(user: Pick<User, 'role'>): boolean {
    return user.role === 'administrator';
  }
}