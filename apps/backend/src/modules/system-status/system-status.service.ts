import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemStatus } from './entities/system-status.entity';
import { UpdateSystemStatusDto } from './dto/update-system-status.dto';

export interface PublicSystemStatus {
  enabled: boolean;
  severity: 'info' | 'warning' | 'critical' | 'maintenance';
  title: string | null;
  message: string | null;
  updatedAt: string;
}

@Injectable()
export class SystemStatusService {
  private readonly logger = new Logger(SystemStatusService.name);

  constructor(
    @InjectRepository(SystemStatus)
    private readonly repo: Repository<SystemStatus>,
  ) {}

  /**
   * Read path — public. Returns a sanitized shape that the login page
   * consumes. Never leaks updatedBy (user UUID).
   */
  async getPublic(): Promise<PublicSystemStatus> {
    const row = await this.repo.findOne({ where: { statusId: 1 } });
    if (!row) {
      // Should never happen thanks to the seed insert, but stay defensive.
      return {
        enabled: false,
        severity: 'info',
        title: null,
        message: null,
        updatedAt: new Date().toISOString(),
      };
    }

    // If suppressUntil is in the future, treat as disabled for the UI.
    const now = Date.now();
    const suppressed =
      row.suppressUntil != null && row.suppressUntil.getTime() > now;

    return {
      enabled: row.enabled && !suppressed,
      severity: row.severity,
      title: row.title,
      message: row.message,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Write path — administrator only (enforced at the controller).
   */
  async update(
    dto: UpdateSystemStatusDto,
    actingUserId: string,
  ): Promise<PublicSystemStatus> {
    const row = await this.repo.findOne({ where: { statusId: 1 } });
    if (!row) throw new NotFoundException('System status row missing');

    // Guard: cannot enable without a title.
    const willEnable = dto.enabled ?? row.enabled;
    const effectiveTitle = dto.title ?? row.title;
    if (willEnable && (!effectiveTitle || effectiveTitle.trim() === '')) {
      throw new BadRequestException(
        'A title is required when the banner is enabled.',
      );
    }

    if (dto.enabled !== undefined) row.enabled = dto.enabled;
    if (dto.severity !== undefined) row.severity = dto.severity;
    if (dto.title !== undefined) row.title = dto.title.trim() || null;
    if (dto.message !== undefined) {
      row.message = dto.message?.trim() ? dto.message.trim() : null;
    }
    row.updatedBy = actingUserId;

    const saved = await this.repo.save(row);

    this.logger.log(
      `System status updated: enabled=${saved.enabled} severity=${saved.severity}`,
    );

    return {
      enabled: saved.enabled,
      severity: saved.severity,
      title: saved.title,
      message: saved.message,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }
}