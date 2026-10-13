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

/**
 * Audit trail read endpoint.
 *
 * After the Admin→Dean consolidation:
 *   - College Dean has full read access to the audit log (inherits
 *     the admin capability).
 *   - Department Head does NOT have audit read access.
 *
 * The `administrator` role is dropped from the class-level @Roles()
 * decorator. The hidden dev account does NOT reach this route via
 * the HTTP API — audit inspection for dev work is done via the
 * Supabase SQL editor instead.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('college_dean')
@Controller('v1/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

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