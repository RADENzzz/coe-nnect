import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Auditable } from '../../common/decorators/auditable.decorator';
import { ScheduleUnfinalizeService } from './services/schedule-unfinalize.service';
import { CreateScheduleUnfinalizeRequestDto } from './dto/create-schedule-unfinalize-request.dto';
import { RespondScheduleUnfinalizeRequestDto } from './dto/respond-schedule-unfinalize-request.dto';

/**
 * Dean-approved unfinalize requests for published schedule entries.
 *
 * Kept in its own controller so the scheduling controller's `:id` routes stay
 * untouched. Both controllers share the `v1/schedules` prefix; every route
 * here starts with a literal segment, so there is no `:id` collision.
 */
@ApiTags('Scheduling')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/schedules')
export class ScheduleUnfinalizeController {
  constructor(private readonly service: ScheduleUnfinalizeService) {}

  /** Dean inbox: every request, newest first. */
  @Get('unfinalize-requests')
  @Roles('college_dean', 'administrator')
  async findRequests(
    @Query('status') status?: string,
    @Query('termId') termId?: string,
  ) {
    return { data: await this.service.findRequests({ status, termId }) };
  }

  /** Dean decision: approve moves the entry back to Draft, reject keeps it. */
  @Auditable({
    action: 'schedule.unfinalize_respond',
    source: 'Scheduling',
  })
  @Patch('unfinalize-requests/:requestId')
  @Roles('college_dean', 'administrator')
  async respond(
    @Param('requestId') requestId: string,
    @Body() dto: RespondScheduleUnfinalizeRequestDto,
    @Req() req: any,
  ) {
    return { data: await this.service.respond(requestId, dto, req.profile) };
  }

  /** The open request (if any) for one schedule entry, used by the drawer. */
  @Get(':id/unfinalize-request')
  @Roles('college_dean', 'department_head')
  async findPending(@Param('id') id: string, @Req() req: any) {
    return {
      data: await this.service.findPendingForSchedule(id, req.profile),
    };
  }

  /** DH files a request instead of unfinalizing a published entry directly. */
  @Auditable({
    action: 'schedule.unfinalize_request',
    source: 'Scheduling',
  })
  @Post(':id/unfinalize-request')
  @Roles('department_head')
  async create(
    @Param('id') id: string,
    @Body() dto: CreateScheduleUnfinalizeRequestDto,
    @Req() req: any,
  ) {
    return { data: await this.service.create(id, dto, req.profile) };
  }
}
