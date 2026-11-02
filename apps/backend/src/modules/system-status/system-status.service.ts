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
  maintenanceMode: boolean;
  title: string | null;
  message: string | null;
  updatedAt: string;
}

export interface MaintenanceNotice {
  active: boolean;
  title: string | null;
  message: string | null;
}

@Injectable()
export class SystemStatusService {
  private readonly logger = new Logger(SystemStatusService.name);

  /** Short cache so per-request guards do not hammer the singleton row. */
  private maintenanceCache:
    | { checkedAt: number; notice: MaintenanceNotice }
    | null = null;
  private readonly MAINTENANCE_TTL_MS = 3_000;

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
        maintenanceMode: false,
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
      maintenanceMode: row.maintenanceMode === true,
      title: row.title,
      message: row.message,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Guard-facing read. Cheap enough to call on every authenticated request,
   * cached for a few seconds so a burst of requests only hits the DB once.
   *
   * Maintenance mode is independent of the popup banner: it blocks access
   * even when `enabled` is false.
   */
  async getMaintenanceNotice(): Promise<MaintenanceNotice> {
    // Local-only escape hatch. The hosted database can stay in maintenance
    // while a developer continues to use the app on their own machine.
    // Never honored in production builds/runs.
    if (this.isLocalMaintenanceBypassEnabled()) {
      return { active: false, title: null, message: null };
    }

    const cached = this.maintenanceCache;
    if (cached && Date.now() - cached.checkedAt < this.MAINTENANCE_TTL_MS) {
      return cached.notice;
    }

    const row = await this.repo.findOne({
      where: { statusId: 1 },
      select: ['maintenanceMode', 'title', 'message'],
    });

    const notice: MaintenanceNotice = {
      active: row?.maintenanceMode === true,
      title: row?.title ?? null,
      message: row?.message ?? null,
    };
    this.maintenanceCache = { checkedAt: Date.now(), notice };
    return notice;
  }

  /** Opt-in local bypass: `MAINTENANCE_BYPASS=true` in a development .env. */
  private isLocalMaintenanceBypassEnabled(): boolean {
    return (
      process.env.NODE_ENV === 'development' &&
      process.env.MAINTENANCE_BYPASS?.trim().toLowerCase() === 'true'
    );
  }

  /** Called after a write so the gate takes effect immediately. */
  private invalidateMaintenanceCache(): void {
    this.maintenanceCache = null;
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

    // Guard: cannot enable the banner or the maintenance gate without a
    // title. The maintenance page and the popup both render it.
    const willEnable = dto.enabled ?? row.enabled;
    const willMaintain = dto.maintenanceMode ?? row.maintenanceMode;
    const effectiveTitle = dto.title ?? row.title;
    if (
      (willEnable || willMaintain) &&
      (!effectiveTitle || effectiveTitle.trim() === '')
    ) {
      throw new BadRequestException(
        'A title is required when the banner or maintenance mode is enabled.',
      );
    }

    if (dto.enabled !== undefined) row.enabled = dto.enabled;
    if (dto.severity !== undefined) row.severity = dto.severity;
    if (dto.maintenanceMode !== undefined) {
      row.maintenanceMode = dto.maintenanceMode;
    }
    if (dto.title !== undefined) row.title = dto.title.trim() || null;
    if (dto.message !== undefined) {
      row.message = dto.message?.trim() ? dto.message.trim() : null;
    }
    row.updatedBy = actingUserId;

    const saved = await this.repo.save(row);
    this.invalidateMaintenanceCache();

    this.logger.log(
      `System status updated: enabled=${saved.enabled} ` +
        `maintenanceMode=${saved.maintenanceMode} severity=${saved.severity}`,
    );

    return {
      enabled: saved.enabled,
      severity: saved.severity,
      maintenanceMode: saved.maintenanceMode === true,
      title: saved.title,
      message: saved.message,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }
}