import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditTrail } from './entities/audit-trail.entity';

export interface WriteAuditInput {
  userId: string | null;
  action: string;
  affectedData: Record<string, unknown> | null;
  sourceSystem: string;
}

export interface FindAuditFilters {
  from?: Date;
  to?: Date;
  action?: string;
  userId?: string;
  sourceSystem?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditTrail)
    private readonly repo: Repository<AuditTrail>,
  ) {}

  /**
   * Persist an audit entry. Never throws — logs on failure so a broken
   * audit write can't take down the business operation it was tracking.
   */
  async write(input: WriteAuditInput): Promise<void> {
    try {
      const entity = this.repo.create({
        userId: input.userId,
        action: input.action,
        affectedData: input.affectedData,
        sourceSystem: input.sourceSystem,
        timestamp: new Date(),
      });
      await this.repo.save(entity);
    } catch (err: any) {
      this.logger.error(
        `Failed to write audit entry [${input.action}]: ${err?.message ?? err}`,
      );
    }
  }

  /**
   * Read endpoint — used by Pass B (the audit trail page). Kept here so
   * AuditService is the single source of truth for the audit_trail table.
   */
  async findAll(filters: FindAuditFilters = {}) {
    const limit = Math.min(filters.limit ?? 50, 200);
    const offset = filters.offset ?? 0;

    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.user', 'user')
      .orderBy('a.timestamp', 'DESC')
      .limit(limit)
      .offset(offset);

    if (filters.from) {
      qb.andWhere('a.timestamp >= :from', { from: filters.from });
    }
    if (filters.to) {
      qb.andWhere('a.timestamp <= :to', { to: filters.to });
    }
    if (filters.action) {
      qb.andWhere('a.action = :action', { action: filters.action });
    }
    if (filters.userId) {
      qb.andWhere('a.user_id = :userId', { userId: filters.userId });
    }
    if (filters.sourceSystem) {
      qb.andWhere('a.source_system = :sourceSystem', {
        sourceSystem: filters.sourceSystem,
      });
    }

    const [rows, total] = await qb.getManyAndCount();
    return { rows, total, limit, offset };
  }

  /** Distinct action labels — useful for the filter dropdown in Pass B. */
  async distinctActions(): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('a')
      .select('DISTINCT a.action', 'action')
      .orderBy('a.action', 'ASC')
      .getRawMany<{ action: string }>();
    return rows.map((r) => r.action);
  }

  /** Distinct source_system labels — useful for the filter dropdown in Pass B. */
  async distinctSources(): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('a')
      .select('DISTINCT a.source_system', 'source')
      .where('a.source_system IS NOT NULL')
      .orderBy('a.source_system', 'ASC')
      .getRawMany<{ source: string }>();
    return rows.map((r) => r.source);
  }
}