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

/**
 * Dev-only operations.
 *
 * Every method is guarded by @Roles('administrator') at the
 * controller layer. Do NOT reuse these methods from production code
 * paths — they intentionally bypass normal business rules.
 */
@Injectable()
export class DevToolsService {
  private readonly logger = new Logger(DevToolsService.name);

  /** In-memory job tracker. Cleared on backend restart. */
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
  // Seed / Reset — spawn pnpm, stream output
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

  /**
   * Spawn `pnpm --filter @coe-nnect/backend <script>` as a child
   * process and capture its stdout/stderr into the job record.
   *
   * Running the CLI script directly is more reliable than dynamic
   * `import()` of the seed module — the CLI is exactly what a dev
   * would run by hand, so behavior is guaranteed identical.
   */
  private async spawnJob(jobId: string, script: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    // Resolve the monorepo root: this file lives at
    // apps/backend/dist/modules/dev-tools/dev-tools.service.js
    // after build, or apps/backend/src/modules/dev-tools/... in dev.
    // Either way, ../../../../../ from __dirname lands on the repo root.
    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');

    const isWindows = process.platform === 'win32';
    const pnpm = isWindows ? 'pnpm.cmd' : 'pnpm';

    return new Promise((resolve) => {
      const child = spawn(
        pnpm,
        ['--filter', '@coe-nnect/backend', script],
        {
          cwd: repoRoot,
          env: {
            ...process.env,
            // reset.ts prompts via readline; skip it
            SKIP_CONFIRM: '1',
            // Force non-interactive output
            CI: '1',
          },
          shell: isWindows, // pnpm.cmd needs a shell on Windows
        },
      );

      const append = (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        job.output += text;
        // Cap the buffer at ~32 KB so a runaway process can't OOM us
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
        this.logger.error(`Job ${jobId} spawn error: ${err.message}`);
        resolve();
      });

      child.on('close', (code) => {
        job.finishedAt = Date.now();
        if (code === 0) {
          job.status = 'success';
          job.output += `\n[exited ${code}]`;
          this.logger.log(`Job ${jobId} (${script}) completed`);
        } else {
          job.status = 'failed';
          job.error = `Process exited with code ${code}`;
          this.logger.error(`Job ${jobId} (${script}) exited ${code}`);
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

    this.logger.warn(
      `DEV: password reset for ${user.email} (${user.username})`,
    );
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

    // Sync to auth app_metadata so the JWT reflects it on next login.
    const { data: authUser } = await this.supabase
      .getAdminClient()
      .auth.admin.getUserById(userId);

    const existingMetadata = (authUser?.user?.app_metadata ?? {}) as Record<
      string,
      unknown
    >;

    const { error } = await this.supabase
      .getAdminClient()
      .auth.admin.updateUserById(userId, {
        app_metadata: { ...existingMetadata, username: newUsername },
      });

    if (error) {
      this.logger.warn(
        `Rename: profile updated but auth sync failed for ${userId}: ${error.message}`,
      );
    }

    this.logger.warn(`DEV: renamed user ${userId} to "${newUsername}"`);
    return { success: true, username: newUsername };
  }
}