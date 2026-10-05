import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrator', 'college_dean')
@Controller('v1/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  // ─────────────────────────────────────────────
  // Static-prefix routes MUST come before any `:id`
  // route. Not an issue here yet, but keeping the
  // convention consistent with the rest of the code.
  // ─────────────────────────────────────────────

  @Get('actions')
  async actions() {
    return { data: await this.audit.distinctActions() };
  }

  @Get('sources')
  async sources() {
    return { data: await this.audit.distinctSources() };
  }

  @Get()
  async findAll(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('sourceSystem') sourceSystem?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : 50;
    const parsedOffset = offset ? Number(offset) : 0;

    const result = await this.audit.findAll({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      action: action || undefined,
      userId: userId || undefined,
      sourceSystem: sourceSystem || undefined,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : 50,
      offset: Number.isFinite(parsedOffset) ? parsedOffset : 0,
    });

    return { data: result };
  }
}