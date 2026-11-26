import {
  Body,
  Controller,
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
  ApplyReuseDto,
  PreflightReuseDto,
} from '../dto/reuse-published-version.dto';
import { ScheduleReuseService } from '../services/schedule-reuse.service';
import { TermPublishedVersionService } from '../services/term-published-version.service';
import { VersionCompareService } from '../services/version-compare.service';

/**
 * Read-only archive of term-wide published snapshots and the cross-term
 * version diff. Registered before the scheduling controller so the literal
 * `published-versions` and `version-compare` routes cannot be captured by
 * `v1/schedules/:id`. Stale versions stay readable and comparable.
 */
@ApiTags('Scheduling')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/schedules')
export class PublishedVersionController {
  constructor(
    private readonly publishedVersions: TermPublishedVersionService,
    private readonly compare: VersionCompareService,
    private readonly reuse: ScheduleReuseService,
  ) {}

  /** Archive browser: summaries, optionally narrowed by semester. */
  @Get('published-versions')
  @Roles('college_dean', 'department_head', 'college_secretary', 'administrator')
  async findAll(@Query('semester') semester?: string) {
    return { data: await this.publishedVersions.findBySemester(semester) };
  }

  /** One snapshot, including its captured entries. */
  @Get('published-versions/:versionId')
  @Roles('college_dean', 'department_head', 'college_secretary', 'administrator')
  async findOne(@Param('versionId') versionId: string) {
    return { data: await this.publishedVersions.findById(versionId) };
  }

  /** Read-only diff of `published:`, `history:` or `live:` sources. */
  @Get('version-compare')
  @Roles('college_dean', 'department_head', 'college_secretary', 'administrator')
  async compareVersions(
    @Query('a') a: string,
    @Query('b') b: string,
    @Req() req: any,
    @Query('deptId') deptId?: string,
  ) {
    return { data: await this.compare.compareSources(a, b, req.profile, deptId) };
  }

  /** Draft-only preview of reusing published rows into a target term. */
  @Post('published-versions/:versionId/preflight')
  @Roles('department_head', 'administrator')
  async preflightReuse(
    @Param('versionId') versionId: string,
    @Body() dto: PreflightReuseDto,
    @Req() req: any,
  ) {
    return { data: await this.reuse.preflight(versionId, dto, req.profile) };
  }

  /** Apply the ready candidates as drafts; conflicts stay unresolved. */
  @Post('published-versions/:versionId/reuse')
  @Roles('department_head', 'administrator')
  @Auditable({ action: 'schedule.reuse', source: 'Scheduling' })
  async applyReuse(
    @Param('versionId') versionId: string,
    @Body() dto: ApplyReuseDto,
    @Req() req: any,
  ) {
    return { data: await this.reuse.apply(versionId, dto, req.profile) };
  }
}
