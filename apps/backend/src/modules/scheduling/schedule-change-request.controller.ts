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
import { ScheduleChangeRequestService } from './services/schedule-change-request.service';
import { CreateScheduleChangeRequestDto } from './dto/create-schedule-change-request.dto';
import { RespondScheduleChangeRequestDto } from './dto/respond-schedule-change-request.dto';

/**
 * Change requests for review or finalized schedule entries; approval returns
 * the entry to Draft.
 *
 * Kept in its own controller so the scheduling controller's `:id` routes stay
 * untouched. Both controllers share the `v1/schedules` prefix; the inbox route
 * uses a literal segment, and the per-entry routes end in `change-request`,
 * so they do not collide with `GET v1/schedules/:id`.
 */
@ApiTags('Scheduling')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/schedules')
export class ScheduleChangeRequestController {
  constructor(private readonly service: ScheduleChangeRequestService) {}

  /** Dean inbox: every request, newest first. */
  @Get('change-requests')
  @Roles('college_dean', 'administrator')
  async findRequests(
    @Query('status') status?: string,
    @Query('termId') termId?: string,
  ) {
    return { data: await this.service.findRequests({ status, termId }) };
  }

  /** Dean decision: approve applies the change, reject keeps the entry as-is. */
  @Auditable({
    action: 'schedule.change_respond',
    source: 'Scheduling',
  })
  @Patch('change-requests/:requestId')
  @Roles('college_dean', 'administrator')
  async respond(
    @Param('requestId') requestId: string,
    @Body() dto: RespondScheduleChangeRequestDto,
    @Req() req: any,
  ) {
    return { data: await this.service.respond(requestId, dto, req.profile) };
  }

  /** The latest change request (if any) for one schedule entry. */
  @Get(':id/change-request')
  @Roles('college_dean', 'department_head', 'administrator')
  async findForSchedule(@Param('id') id: string, @Req() req: any) {
    return { data: await this.service.findForSchedule(id, req.profile) };
  }

  /** DH files a request instead of editing a review/finalized entry directly. */
  @Auditable({
    action: 'schedule.change_request',
    source: 'Scheduling',
  })
  @Post(':id/change-request')
  @Roles('department_head')
  async create(
    @Param('id') id: string,
    @Body() dto: CreateScheduleChangeRequestDto,
    @Req() req: any,
  ) {
    return { data: await this.service.create(id, dto, req.profile) };
  }
}
