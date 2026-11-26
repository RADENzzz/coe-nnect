// apps/backend/src/modules/scheduling/services/term-lifecycle.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
  Repository,
} from 'typeorm';

import { SupabaseService } from '../../../database/supabase.service';
import { Term } from '../../terms/entities/term.entity';
import { Schedule } from '../entities/schedule.entity';
import { ScheduleChangeRequest } from '../entities/schedule-change-request.entity';
import { SchedulePublishRequest } from '../entities/schedule-publish-request.entity';
import { ScheduleUnfinalizeRequest } from '../entities/schedule-unfinalize-request.entity';
import {
  TermPublishedVersionService,
  type PublishedVersionSummary,
} from './term-published-version.service';

export type TermLifecycleSummary = {
  termId: string;
  termName: string;
  statusCounts: {
    draft: number;
    review: number;
    finalized: number;
    published: number;
  };
  pendingRequests: {
    publish: number;
    change: number;
    unfinalize: number;
    faculty: number;
  };
  savedVersion: PublishedVersionSummary | null;
  otherTerm: {
    termId: string;
    termName: string;
    statusCounts: TermLifecycleSummary['statusCounts'];
  } | null;
};

const STATUSES: Array<keyof TermLifecycleSummary['statusCounts']> = [
  'draft',
  'review',
  'finalized',
  'published',
];

/**
 * Term deactivation save-and-clear and activation restore-and-swap.
 *
 * Requests and Faculty requests are closed before the live grid is cleared so
 * nothing points at a row that no longer exists. Grid writes, request closure,
 * and active-flag swaps share one transaction; faculty requests live in
 * Supabase and are closed there. If a later DB step fails, those Supabase
 * cancellations are undone before the original error is rethrown.
 */
@Injectable()
export class TermLifecycleService {
  private readonly logger = new Logger(TermLifecycleService.name);

  constructor(
    @InjectRepository(Term)
    private readonly termRepo: Repository<Term>,
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    @InjectRepository(SchedulePublishRequest)
    private readonly publishRequestRepo: Repository<SchedulePublishRequest>,
    @InjectRepository(ScheduleChangeRequest)
    private readonly changeRequestRepo: Repository<ScheduleChangeRequest>,
    @InjectRepository(ScheduleUnfinalizeRequest)
    private readonly unfinalizeRequestRepo: Repository<ScheduleUnfinalizeRequest>,
    private readonly dataSource: DataSource,
    private readonly versions: TermPublishedVersionService,
    private readonly supabase: SupabaseService,
  ) {}

  async summary(
    termId: string,
    action: 'deactivate' | 'activate',
  ): Promise<TermLifecycleSummary> {
    const term = await this.termRepo.findOne({ where: { termId } });
    if (!term) throw new NotFoundException('Term not found');

    const [statusCounts, pendingRequests, saved] = await Promise.all([
      this.countStatuses(this.scheduleRepo, String(term.termId)),
      this.countPendingRequests(String(term.termId)),
      this.versions.findBySemester(),
    ]);

    let otherTerm: TermLifecycleSummary['otherTerm'] = null;
    if (action === 'activate') {
      const active = await this.termRepo.findOne({
        where: { isActive: true },
      });
      if (active && String(active.termId) !== String(term.termId)) {
        otherTerm = {
          termId: String(active.termId),
          termName: active.termName,
          statusCounts: await this.countStatuses(
            this.scheduleRepo,
            String(active.termId),
          ),
        };
      }
    }

    return {
      termId: String(term.termId),
      termName: term.termName,
      statusCounts,
      pendingRequests,
      savedVersion:
        saved.find((version) => String(version.termId) === String(term.termId)) ??
        null,
      otherTerm,
    };
  }

  async deactivate(termId: string, actor: any): Promise<void> {
    const cancelledFacultyIds: string[] = [];
    try {
      await this.dataSource.transaction(async (manager) => {
        await this.saveAndClear(manager, termId, actor, cancelledFacultyIds);
        await this.terms(manager).update({ termId }, { isActive: false });
      });
    } catch (error) {
      await this.restoreCancelledFacultyRequests(cancelledFacultyIds);
      throw error;
    }
  }

  async activate(termId: string, actor: any): Promise<void> {
    const cancelledFacultyIds: string[] = [];
    try {
      await this.dataSource.transaction(async (manager) => {
        const target = await this.terms(manager).findOne({ where: { termId } });
        if (!target) throw new NotFoundException('Term not found');

        const active = await this.terms(manager).findOne({
          where: { isActive: true },
        });
        if (active && String(active.termId) === String(termId)) return;
        if (active) {
          await this.saveAndClear(
            manager,
            String(active.termId),
            actor,
            cancelledFacultyIds,
          );
        }

        await manager
          .createQueryBuilder()
          .update(Term)
          .set({ isActive: false })
          .where('is_active = :active', { active: true })
          .execute();
        await manager
          .createQueryBuilder()
          .update(Term)
          .set({ isActive: true })
          .where('term_id = :id', { id: termId })
          .execute();

        await this.versions.restoreTerm(termId, manager);
      });
    } catch (error) {
      await this.restoreCancelledFacultyRequests(cancelledFacultyIds);
      throw error;
    }
  }

  private async saveAndClear(
    manager: EntityManager,
    termId: string,
    actor: any,
    cancelledFacultyIds: string[],
  ): Promise<void> {
    const term = await this.terms(manager).findOne({ where: { termId } });
    if (!term) throw new NotFoundException('Term not found');

    // Order matters: save every row first, close anything that references
    // those rows, and only then remove the live grid. Record the Supabase
    // cancellations before the next DB step so a failure there can be undone.
    await this.versions.writeTerm(
      String(term.termId),
      actor,
      'deactivated',
      manager,
    );
    const ids = await this.closeRequests(
      manager,
      String(term.termId),
      term.termName,
      actor,
    );
    cancelledFacultyIds.push(...ids);
    await this.versions.clearTerm(String(term.termId), manager);
  }

  private async closeRequests(
    manager: EntityManager,
    termId: string,
    termName: string,
    actor: any,
  ): Promise<string[]> {
    const remarks =
      `Term deactivated: ${termName}. Pending request closed because ` +
      'the term schedule was saved and cleared.';
    const respondedBy = actor?.userId ?? actor?.id ?? null;
    const respondedAt = new Date();
    const values = {
      status: 'cancelled',
      respondedBy,
      respondedAt,
      responseRemarks: remarks,
    };
    const ids = (await this.schedules(manager).find({ where: { termId } }))
      .map((row) => row.scheduleId)
      .filter((id): id is string => id != null)
      .map(String);

    if (ids.length > 0) {
      await this.closeRequestsIn(
        this.publishRequests(manager),
        ids,
        values,
      );
      await this.closeRequestsIn(this.changeRequests(manager), ids, values);
      await this.closeRequestsIn(
        this.unfinalizeRequests(manager),
        ids,
        values,
      );
    }

    return this.cancelFacultyRequests(termId, actor, remarks);
  }

  private async closeRequestsIn<T extends object>(
    repo: Repository<T>,
    scheduleIds: string[],
    values: Record<string, unknown>,
  ): Promise<void> {
    const pending = await repo.find({
      where: {
        scheduleId: In(scheduleIds),
        status: 'pending',
      } as unknown as FindOptionsWhere<T>,
    });
    for (const request of pending) {
      await repo.save({ ...request, ...values } as T);
    }
  }

  private async cancelFacultyRequests(
    termId: string,
    actor: any,
    remarks: string,
  ): Promise<string[]> {
    const result: any = await this.supabase
      .getAdminClient()
      .from('faculty_request')
      .update({
        status: 'cancelled',
        responded_by: actor?.userId ?? actor?.id ?? null,
        responded_at: new Date().toISOString(),
        response_remarks: remarks,
      })
      .eq('term_id', termId)
      .eq('status', 'pending')
      .select('request_id');
    if (result?.error) {
      throw new Error(
        `Failed to close faculty requests: ${result.error.message}`,
      );
    }
    return (result?.data ?? []).map((row: any) => String(row.request_id));
  }

  /**
   * Supabase writes cannot join the TypeORM transaction. If a later DB step
   * fails, put the exact rows we cancelled back to pending so the failure
   * path does not lose requests. A failed compensation is logged and never
   * replaces the original error.
   */
  private async restoreCancelledFacultyRequests(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      const result: any = await this.supabase
        .getAdminClient()
        .from('faculty_request')
        .update({
          status: 'pending',
          responded_by: null,
          responded_at: null,
          response_remarks: null,
        })
        .in('request_id', ids);
      if (result?.error) {
        this.logger.warn(
          `Failed to restore faculty requests after a failed term switch: ${result.error.message}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to restore faculty requests after a failed term switch: ${(error as Error).message}`,
      );
    }
  }

  private async countStatuses(
    repo: Repository<Schedule>,
    termId: string,
  ): Promise<TermLifecycleSummary['statusCounts']> {
    const counts = await Promise.all(
      STATUSES.map((status) =>
        repo.count({ where: { termId, status } as FindOptionsWhere<Schedule> }),
      ),
    );
    return {
      draft: counts[0],
      review: counts[1],
      finalized: counts[2],
      published: counts[3],
    };
  }

  private async countPendingRequests(
    termId: string,
  ): Promise<TermLifecycleSummary['pendingRequests']> {
    const ids = (await this.scheduleRepo.find({ where: { termId } }))
      .map((row) => row.scheduleId)
      .filter((id): id is string => id != null)
      .map(String);
    const pending = (repo: Repository<any>) =>
      ids.length === 0
        ? Promise.resolve(0)
        : repo.count({
            where: { scheduleId: In(ids), status: 'pending' },
          });
    const [publish, change, unfinalize, faculty] = await Promise.all([
      pending(this.publishRequestRepo),
      pending(this.changeRequestRepo),
      pending(this.unfinalizeRequestRepo),
      this.countFacultyRequests(termId),
    ]);
    return { publish, change, unfinalize, faculty };
  }

  private async countFacultyRequests(termId: string): Promise<number> {
    const result: any = await this.supabase
      .getAdminClient()
      .from('faculty_request')
      .select('request_id', { count: 'exact', head: true })
      .eq('term_id', termId)
      .eq('status', 'pending');
    if (result?.error) {
      throw new Error(
        `Failed to count faculty requests: ${result.error.message}`,
      );
    }
    return Number(result?.count ?? 0);
  }

  private terms(manager?: EntityManager): Repository<Term> {
    return manager ? manager.getRepository(Term) : this.termRepo;
  }

  private schedules(manager?: EntityManager): Repository<Schedule> {
    return manager ? manager.getRepository(Schedule) : this.scheduleRepo;
  }

  private publishRequests(
    manager?: EntityManager,
  ): Repository<SchedulePublishRequest> {
    return manager
      ? manager.getRepository(SchedulePublishRequest)
      : this.publishRequestRepo;
  }

  private changeRequests(
    manager?: EntityManager,
  ): Repository<ScheduleChangeRequest> {
    return manager
      ? manager.getRepository(ScheduleChangeRequest)
      : this.changeRequestRepo;
  }

  private unfinalizeRequests(
    manager?: EntityManager,
  ): Repository<ScheduleUnfinalizeRequest> {
    return manager
      ? manager.getRepository(ScheduleUnfinalizeRequest)
      : this.unfinalizeRequestRepo;
  }
}
