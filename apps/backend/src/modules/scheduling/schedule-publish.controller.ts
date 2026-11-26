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
import { SchedulePublishService } from './services/schedule-publish.service';
import { CreateSchedulePublishRequestDto } from './dto/create-schedule-publish-request.dto';
import { RespondSchedulePublishRequestDto } from './dto/respond-schedule-publish-request.dto';

/**
 * Dean-approved publication flow for finalized schedule entries.
 *
 * Kept in its own controller so the scheduling controller's `:id` routes stay
 * untouched. Both controllers share the `v1/schedules` prefix; the inbox route
 * uses a literal segment, and the per-entry routes end in `publish-request`,
 * so they do not collide with `GET v1/schedules/:id`.
 */
@ApiTags('Scheduling')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/schedules')
export class SchedulePublishController {
  constructor(private readonly service: SchedulePublishService) {}

  /** Dean inbox: every request, newest first. */
  @Get('publish-requests')
  @Roles('college_dean', 'administrator')
  async findRequests(
    @Query('status') status?: string,
    @Query('termId') termId?: string,
  ) {
    return { data: await this.service.findRequests({ status, termId }) };
  }

  /** Dean decision: approve publishes the entry, reject returns it to Draft. */
  @Auditable({
    action: 'schedule.publish_respond',
    source: 'Scheduling',
  })
  @Patch('publish-requests/:requestId')
  @Roles('college_dean', 'administrator')
  async respond(
    @Param('requestId') requestId: string,
    @Body() dto: RespondSchedulePublishRequestDto,
    @Req() req: any,
  ) {
    return { data: await this.service.respond(requestId, dto, req.profile) };
  }

  /** The latest publish request (if any) for one schedule entry. */
  @Get(':id/publish-request')
  @Roles('college_dean', 'department_head', 'administrator')
  async findForSchedule(@Param('id') id: string, @Req() req: any) {
    return { data: await this.service.findForSchedule(id, req.profile) };
  }

  /** DH files a request instead of publishing the entry directly. */
  @Auditable({
    action: 'schedule.publish_request',
    source: 'Scheduling',
  })
  @Post(':id/publish-request')
  @Roles('department_head')
  async create(
    @Param('id') id: string,
    @Body() dto: CreateSchedulePublishRequestDto,
    @Req() req: any,
  ) {
    return { data: await this.service.create(id, dto, req.profile) };
  }
}
