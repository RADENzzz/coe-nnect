import {
  Controller,
  Get,
  HttpCode,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Auditable } from '../../common/decorators/auditable.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AckChangeRequestDto } from './dto/ack-change-request.dto';
import { ListChangeRequestsDto } from './dto/list-change-requests.dto';
import { PublishScheduleDto } from './dto/publish-schedule.dto';
import { SyncFacultyDto } from './dto/sync-faculty.dto';
import { IdpChangeRequestService } from './idp-change-request.service';
import { IdpDeviceGuard } from './idp-device.guard';
import { IdpOutboxService } from './idp-outbox.service';
import { IdpSchedulePublisherService } from './idp-schedule-publisher.service';
import { IdpSignatureGuard } from './idp-signature.guard';
import { IdpSyncService } from './idp-sync.service';
import type {
  IdpChangeRequestPayload,
  IdpFacultyChangeEvent,
  IdpFacultyInboxBody,
} from './idp.types';

/**
 * Public IDP namespace (contract 9.2).
 *
 * Mounted under the global `api` prefix, so the final paths are:
 *   GET  /api/idp/v1/health
 *   POST /api/idp/v1/webhooks/faculty-changed
 *   POST /api/idp/v1/inbox/faculty
 *   GET  /api/idp/v1/outbox/schedules?since=&limit=
 *
 * The inbox/outbox routes implement Pattern C: the IDP desktop app pushes
 * faculty snapshots and polls for published schedules whenever it is online.
 * They authenticate with `Authorization: Bearer <IDP_DEVICE_API_KEY>`.
 */
@ApiTags('IDP')
@Controller('idp/v1')
export class IdpController {
  constructor(
    private readonly sync: IdpSyncService,
    private readonly outbox: IdpOutboxService,
    private readonly changeRequests: IdpChangeRequestService,
  ) {}

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
  async facultyChanged(@Body() event: IdpFacultyChangeEvent, @Req() req: any) {
    return {
      data: await this.sync.handleFacultyChange(event, req.idpRequestId),
    };
  }

  /**
   * Milestone 3 — signed change request (contract 4.7 / 5.7).
   *
   * `idp_request_id` is the idempotency key. The request is persisted and
   * surfaced to Dean/secretary reviewers; the acknowledgement is returned
   * through the change-request ack outbox.
   */
  @Post('webhooks/change-request')
  @HttpCode(200)
  @UseGuards(IdpSignatureGuard)
  @ApiOperation({
    summary: 'Receive a signed change request from IDP (HMAC-SHA256)',
  })
  async changeRequest(
    @Body() body: IdpChangeRequestPayload,
    @Req() req: any,
  ) {
    return {
      data: await this.changeRequests.receive(body, req.idpRequestId),
    };
  }

  /**
   * Pattern C — IDP desktop pushes its faculty snapshot when it reconnects.
   *
   * The body is a bare array of Faculty Record (contract 4.1) or
   * `{ "faculty": [...] }`. Per-record failures accumulate in `errors[]`; the
   * request only fails as a whole when the envelope itself is invalid.
   */
  @Post('inbox/faculty')
  @HttpCode(200)
  @UseGuards(IdpDeviceGuard)
  @ApiBearerAuth('idp-device-key')
  @ApiHeader({
    name: 'X-Request-ID',
    required: false,
    description: 'Optional correlation id echoed back in logs and errors.',
  })
  @ApiBody({
    description:
      'Bare array of faculty records, or { "faculty": [...] }. At least one of wmsu_id or employee_id is required per record.',
    schema: {
      oneOf: [
        { type: 'array', items: { type: 'object' } },
        {
          type: 'object',
          properties: {
            faculty: { type: 'array', items: { type: 'object' } },
          },
        },
      ],
    },
  })
  @ApiOperation({
    summary: 'Receive a faculty snapshot pushed by the IDP desktop client',
  })
  async facultyInbox(@Body() body: IdpFacultyInboxBody, @Req() req: any) {
    return {
      data: await this.sync.applyFacultySnapshot(body, req.idpRequestId),
    };
  }

  /**
   * Pattern C — IDP desktop polls published schedules.
   *
   * `since` is inclusive; clients dedupe on `payload.coe_nnect_version_id`.
   * `next_since` may repeat the last item so rows sharing a timestamp are not
   * skipped. Use `limit` to bound catch-up after a long offline period.
   */
  @Get('outbox/schedules')
  @UseGuards(IdpDeviceGuard)
  @ApiBearerAuth('idp-device-key')
  @ApiHeader({
    name: 'X-Request-ID',
    required: false,
    description: 'Optional correlation id echoed back in logs and errors.',
  })
  @ApiQuery({
    name: 'since',
    required: false,
    description: 'Inclusive ISO 8601 cursor, e.g. 2026-11-11T00:00:00Z.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Page size, 1-200. Defaults to 50.',
  })
  @ApiOperation({
    summary: 'Poll published schedules for the IDP desktop client',
  })
  async outboxSchedules(
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    return { data: await this.outbox.listSchedules({ since, limit }) };
  }

  /** Pattern C — latest status for every faculty request (contract 4.5). */
  @Get('outbox/faculty-requests')
  @UseGuards(IdpDeviceGuard)
  @ApiBearerAuth('idp-device-key')
  @ApiQuery({
    name: 'since',
    required: false,
    description: 'Inclusive ISO 8601 cursor, e.g. 2026-11-11T00:00:00Z.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Page size, 1-200. Defaults to 50.',
  })
  @ApiOperation({
    summary: 'Poll faculty-request statuses for the IDP desktop client',
  })
  async outboxFacultyRequests(
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    return { data: await this.outbox.listFacultyRequests({ since, limit }) };
  }

  /** Pattern C — acknowledgements CoE-NNECT has issued (contract 4.8). */
  @Get('outbox/change-request-acks')
  @UseGuards(IdpDeviceGuard)
  @ApiBearerAuth('idp-device-key')
  @ApiQuery({
    name: 'since',
    required: false,
    description: 'Inclusive ISO 8601 cursor, e.g. 2026-11-11T00:00:00Z.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Page size, 1-200. Defaults to 50.',
  })
  @ApiOperation({
    summary: 'Poll change-request acknowledgements for the IDP desktop client',
  })
  async outboxChangeRequestAcks(
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.outbox.listChangeRequestAcks({ since, limit }),
    };
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
    private readonly changeRequests: IdpChangeRequestService,
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

  /**
   * Milestone 3 — review queue for change requests raised by IDP.
   *
   * Acknowledging records the Dean/secretary decision and queues the ack for
   * the offline IDP desktop. Applying the underlying schedule/faculty change
   * remains an explicit action in the existing screens.
   */
  @Get('change-requests')
  @Roles('college_dean', 'college_secretary', 'administrator')
  @ApiOperation({
    summary: 'List change requests received from IDP',
  })
  async listChangeRequests(@Query() dto: ListChangeRequestsDto) {
    return { data: await this.changeRequests.list(dto) };
  }

  @Get('change-requests/:id')
  @Roles('college_dean', 'college_secretary', 'administrator')
  @ApiParam({ name: 'id', description: 'IDP request id, e.g. IDP-REQ-0001.' })
  @ApiOperation({
    summary: 'Read one change request received from IDP',
  })
  async getChangeRequest(@Param('id') id: string) {
    return { data: await this.changeRequests.findOne(id) };
  }

  @Post('change-requests/:id/ack')
  @Roles('college_dean', 'college_secretary', 'administrator')
  @Auditable({ action: 'idp.change_request.ack', source: 'IDP' })
  @ApiParam({ name: 'id', description: 'IDP request id, e.g. IDP-REQ-0001.' })
  @ApiOperation({
    summary: 'Acknowledge a change request and queue the ack for IDP',
  })
  async ackChangeRequest(
    @Param('id') id: string,
    @Body() dto: AckChangeRequestDto,
    @Req() req: any,
  ) {
    return {
      data: await this.changeRequests.acknowledge(id, dto, req.user.id),
    };
  }
}
