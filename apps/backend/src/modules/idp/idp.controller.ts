import {
  Controller,
  Get,
  HttpCode,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auditable } from '../../common/decorators/auditable.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PublishScheduleDto } from './dto/publish-schedule.dto';
import { SyncFacultyDto } from './dto/sync-faculty.dto';
import { IdpSchedulePublisherService } from './idp-schedule-publisher.service';
import { IdpSignatureGuard } from './idp-signature.guard';
import { IdpSyncService } from './idp-sync.service';
import type { IdpFacultyChangeEvent } from './idp.types';

/**
 * Public IDP namespace (contract 9.2).
 *
 * Mounted under the global `api` prefix, so the final paths are:
 *   GET  /api/idp/v1/health
 *   POST /api/idp/v1/webhooks/faculty-changed
 */
@ApiTags('IDP')
@Controller('idp/v1')
export class IdpController {
  constructor(private readonly sync: IdpSyncService) {}

  @Get('health')
  @ApiOperation({ summary: 'IDP integration health and configuration status' })
  async health() {
    return { data: await this.sync.health() };
  }

  @Post('webhooks/faculty-changed')
  @HttpCode(200)
  @UseGuards(IdpSignatureGuard)
  @ApiOperation({
    summary: 'Receive a signed faculty change event from IDP (HMAC-SHA256)',
  })
  async facultyChanged(
    @Body() event: IdpFacultyChangeEvent,
    @Req() req: any,
  ) {
    return { data: await this.sync.handleFacultyChange(event, req.idpRequestId) };
  }
}

/**
 * User-triggered refresh (FR 3.1.11).
 *
 * Kept on the application API surface so the existing Supabase JWT and role
 * guards apply: POST /api/v1/idp/faculty/sync.
 */
@ApiTags('IDP')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/idp')
export class IdpSyncController {
  constructor(
    private readonly sync: IdpSyncService,
    private readonly publisher: IdpSchedulePublisherService,
  ) {}

  @Post('faculty/sync')
  @Roles('college_dean', 'college_secretary', 'department_head')
  @Auditable({ action: 'idp.faculty.sync', source: 'IDP' })
  @ApiOperation({
    summary: 'Refresh faculty, qualifications, and unavailability from IDP',
  })
  async syncFaculty(@Body() dto: SyncFacultyDto, @Req() req: any) {
    const departmentCode = await this.sync.resolveDepartmentScope(
      req.profile,
      dto.departmentCode,
    );

    const includeUnavailability =
      dto.includeUnavailability ?? Boolean(dto.termCode);

    const data = await this.sync.syncFaculty({
      departmentCode,
      termCode: dto.termCode,
      includeQualifications: dto.includeQualifications,
      includeUnavailability,
    });

    return { data };
  }

  /**
   * Preview exactly what a publish would send. Same builder as the push, so
   * the review screen and the wire can never disagree (contract 4.4).
   */
  @Get('schedules/payload')
  @Roles('college_dean', 'college_secretary', 'administrator')
  @ApiOperation({
    summary: 'Preview the published-schedule payload for a term',
  })
  async schedulePayload(@Query() dto: PublishScheduleDto) {
    return { data: await this.publisher.buildPayload(dto.termCode) };
  }

  /**
   * Milestone 2 — term-wide push to `POST {IDP_BASE}/schedules/published`.
   *
   * A delivery failure is reported in the body, not thrown: the local
   * publish already happened and must not be presented as failed. The
   * version row survives, so a replay reuses the same
   * `coe_nnect_version_id` and IDP deduplicates it.
   */
  @Post('schedules/publish')
  @Roles('college_dean', 'college_secretary', 'administrator')
  @Auditable({ action: 'idp.schedule.publish', source: 'IDP' })
  @ApiOperation({
    summary: 'Push a term’s published schedule to IDP',
  })
  async publishSchedule(@Body() dto: PublishScheduleDto) {
    return { data: await this.publisher.publishTerm(dto.termCode) };
  }
}
