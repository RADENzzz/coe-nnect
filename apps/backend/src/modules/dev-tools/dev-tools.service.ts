import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { spawn } from 'child_process';
import * as path from 'path';
import { SupabaseService } from '../../database/supabase.service';
import { User } from '../users/entities/user.entity';

type DevJob = {
  jobId: string;
  kind: 'seed' | 'reset';
  status: 'running' | 'success' | 'failed';
  startedAt: number;
  finishedAt: number | null;
  output: string;
  error: string | null;
};

@Injectable()
export class DevToolsService {
  private readonly logger = new Logger(DevToolsService.name);
  private readonly jobs = new Map<string, DevJob>();

  constructor(
    private readonly supabase: SupabaseService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  // ════════════════════════════════════════════
  // System state
  // ════════════════════════════════════════════

  async getSystemState(): Promise<{
    counts: Record<string, number>;
    activeTerm: {
      termId: string;
      termName: string;
      schoolYear: string;
      semester: string | null;
    } | null;
  }> {
    const db = this.supabase.getAdminClient();

    const tables = [
      'users',
      'department',
      'program',
      'subject',
      'faculty',
      'section',
      'prospectus',
      'schedule',
      'schedule_version',
      'faculty_request',
      'notification',
      'audit_trail',
    ];

    const counts: Record<string, number> = {};
    await Promise.all(
      tables.map(async (t) => {
        const { count, error } = await db
          .from(t)
          .select('*', { count: 'exact', head: true });
        counts[t] = error ? -1 : count ?? 0;
      }),
    );

    const { data: termRow } = await db
      .from('term')
      .select('term_id, term_name, school_year, semester')
      .eq('is_active', true)
      .maybeSingle();

    return {
      counts,
      activeTerm: termRow
        ? {
            termId: String(termRow.term_id),
            termName: termRow.term_name,
            schoolYear: termRow.school_year,
            semester: termRow.semester ?? null,
          }
        : null,
    };
  }

  // ════════════════════════════════════════════
  // Seed / Reset
  // ════════════════════════════════════════════

  async startSeed(): Promise<{ jobId: string }> {
    const jobId = `seed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.jobs.set(jobId, {
      jobId,
      kind: 'seed',
      status: 'running',
      startedAt: Date.now(),
      finishedAt: null,
      output: '',
      error: null,
    });
    this.spawnJob(jobId, 'seed:demo').catch((err) => {
      this.logger.error(`Seed job ${jobId} failed: ${err.message}`);
    });
    return { jobId };
  }

  async startReset(): Promise<{ jobId: string }> {
    const jobId = `reset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.jobs.set(jobId, {
      jobId,
      kind: 'reset',
      status: 'running',
      startedAt: Date.now(),
      finishedAt: null,
      output: '',
      error: null,
    });
    this.spawnJob(jobId, 'reset:demo').catch((err) => {
      this.logger.error(`Reset job ${jobId} failed: ${err.message}`);
    });
    return { jobId };
  }

  private async spawnJob(jobId: string, script: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
    const isWindows = process.platform === 'win32';
    const pnpm = isWindows ? 'pnpm.cmd' : 'pnpm';

    return new Promise((resolve) => {
      const child = spawn(pnpm, ['--filter', '@coe-nnect/backend', script], {
        cwd: repoRoot,
        env: { ...process.env, SKIP_CONFIRM: '1', CI: '1' },
        shell: isWindows,
      });

      const append = (chunk: Buffer) => {
        job.output += chunk.toString('utf-8');
        if (job.output.length > 32_000) {
          job.output = job.output.slice(-32_000);
        }
      };

      child.stdout?.on('data', append);
      child.stderr?.on('data', append);

      child.on('error', (err) => {
        job.status = 'failed';
        job.finishedAt = Date.now();
        job.error = err.message;
        resolve();
      });

      child.on('close', (code) => {
        job.finishedAt = Date.now();
        if (code === 0) {
          job.status = 'success';
          job.output += `\n[exited ${code}]`;
        } else {
          job.status = 'failed';
          job.error = `Process exited with code ${code}`;
        }
        resolve();
      });
    });
  }

  getJobStatus(jobId: string): DevJob | null {
    return this.jobs.get(jobId) ?? null;
  }

  // ════════════════════════════════════════════
  // Per-user operations
  // ════════════════════════════════════════════

  async listUsers(): Promise<
    Array<{
      userId: string;
      username: string;
      email: string;
      role: string;
      isActive: boolean;
      deptId: string | null;
    }>
  > {
    const users = await this.userRepo.find({ order: { username: 'ASC' } });
    return users.map((u) => ({
      userId: u.userId,
      username: u.username,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      deptId: u.deptId,
    }));
  }

  async resetUserPassword(
    userId: string,
    newPassword: string,
  ): Promise<{ success: true }> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('User not found');

    const { error } = await this.supabase
      .getAdminClient()
      .auth.admin.updateUserById(userId, { password: newPassword });

    if (error) {
      throw new BadRequestException(
        `Failed to reset password: ${error.message}`,
      );
    }

    this.logger.warn(`DEV: password reset for ${user.email} (${user.username})`);
    return { success: true };
  }

  async renameUser(
    userId: string,
    newUsername: string,
  ): Promise<{ success: true; username: string }> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('User not found');

    const clash = await this.userRepo.findOne({
      where: { username: newUsername },
    });
    if (clash && clash.userId !== userId) {
      throw new BadRequestException(
        `Username "${newUsername}" is already taken.`,
      );
    }

    user.username = newUsername;
    await this.userRepo.save(user);

    const { data: authUser } = await this.supabase
      .getAdminClient()
      .auth.admin.getUserById(userId);

    const existingMetadata = (authUser?.user?.app_metadata ?? {}) as Record<
      string,
      unknown
    >;

    await this.supabase
      .getAdminClient()
      .auth.admin.updateUserById(userId, {
        app_metadata: { ...existingMetadata, username: newUsername },
      });

    this.logger.warn(`DEV: renamed user ${userId} to "${newUsername}"`);
    return { success: true, username: newUsername };
  }

  // ════════════════════════════════════════════
  // NEW: Toggle user active state (Dev-only)
  // ════════════════════════════════════════════

  async toggleUserActive(
    userId: string,
    actingUserId: string, // <-- NEW parameter
  ): Promise<{ userId: string; isActive: boolean }> {
    if (userId === actingUserId) {
      throw new BadRequestException(
        'You cannot deactivate your own developer account.',
      );
    }

    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('User not found');

    user.isActive = !user.isActive;
    await this.userRepo.save(user);

    try {
      await this.supabase
        .getAdminClient()
        .auth.admin.updateUserById(userId, {
          ban_duration: user.isActive ? 'none' : '876000h',
        });
      this.logger.log(
        `DEV: synced auth ban for ${userId} (isActive: ${user.isActive})`,
      );
    } catch (err) {
      this.logger.warn(
        `DEV: failed to sync auth ban for ${userId}: ${(err as Error).message}`,
      );
    }

    this.logger.warn(
      `DEV: toggled active state for ${user.email} -> ${user.isActive}`,
    );

    return { userId: user.userId, isActive: user.isActive };
  }
}