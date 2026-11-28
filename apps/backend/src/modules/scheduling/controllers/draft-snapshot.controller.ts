import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Auditable } from '../../../common/decorators/auditable.decorator';
import {
  ApplyDraftSnapshotDto,
  DraftSnapshotTargetDto,
  SaveDraftSnapshotDto,
} from '../dto/draft-snapshot.dto';
import { TermDraftSnapshotService } from '../services/term-draft-snapshot.service';

/**
 * Term-scoped named drafts. Registered before the scheduling controller so
 * the literal `draft-snapshots` prefix is not captured by `v1/schedules/:id`.
 */
@ApiTags('Scheduling')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/schedules')
export class DraftSnapshotController {
  constructor(private readonly drafts: TermDraftSnapshotService) {}

  @Get('draft-snapshots')
  @Roles('department_head', 'administrator')
  async findAll(
    @Query('termId') termId: string,
    @Query('deptId') deptId: string,
    @Req() req: any,
  ) {
    return {
      data: await this.drafts.list(termId, deptId, req.profile),
    };
  }

  @Post('draft-snapshots')
  @Roles('department_head', 'administrator')
  @Auditable({ action: 'schedule.draft_save', source: 'Scheduling' })
  async save(@Body() dto: SaveDraftSnapshotDto, @Req() req: any) {
    return { data: await this.drafts.save(dto, req.profile) };
  }

  /** Read-only rows for previewing or comparing a saved draft. */
  @Get('draft-snapshots/:snapshotId/entries')
  @Roles('department_head', 'administrator')
  async entries(
    @Param('snapshotId') snapshotId: string,
    @Query('termId') termId: string,
    @Query('deptId') deptId: string,
    @Req() req: any,
  ) {
    return {
      data: await this.drafts.detail(snapshotId, termId, deptId, req.profile),
    };
  }

  /** Delete only the saved snapshot; live timetable rows are untouched. */
  @Delete('draft-snapshots/:snapshotId')
  @Roles('department_head', 'administrator')
  @Auditable({ action: 'schedule.draft_delete', source: 'Scheduling' })
  async remove(
    @Param('snapshotId') snapshotId: string,
    @Query('termId') termId: string,
    @Query('deptId') deptId: string,
    @Req() req: any,
  ) {
    await this.drafts.delete(snapshotId, termId, deptId, req.profile);
    return { data: { deleted: true } };
  }

  /** Read-only validation of a saved draft against the current term. */
  @Post('draft-snapshots/:snapshotId/preflight')
  @Roles('department_head', 'administrator')
  async preflight(
    @Param('snapshotId') snapshotId: string,
    @Body() dto: DraftSnapshotTargetDto,
    @Req() req: any,
  ) {
    return {
      data: await this.drafts.preflight(snapshotId, dto, req.profile),
    };
  }

  /** Replace the draft/review set only when every entry validated cleanly. */
  @Post('draft-snapshots/:snapshotId/load')
  @Roles('department_head', 'administrator')
  @Auditable({ action: 'schedule.draft_load', source: 'Scheduling' })
  async apply(
    @Param('snapshotId') snapshotId: string,
    @Body() dto: ApplyDraftSnapshotDto,
    @Req() req: any,
  ) {
    return { data: await this.drafts.apply(snapshotId, dto, req.profile) };
  }
}
