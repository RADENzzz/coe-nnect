import {
  Body,
  Controller,
  Get,
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
import { SaveDraftSnapshotDto } from '../dto/draft-snapshot.dto';
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
}
