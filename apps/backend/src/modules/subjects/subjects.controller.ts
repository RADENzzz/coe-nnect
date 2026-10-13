import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { CreateSubjectRestrictionDto } from './dto/create-subject-restriction.dto';
import { UpdateSubjectRestrictionDto } from './dto/update-subject-restriction.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

/**
 * Subject management + subject restrictions.
 *
 * After the Admin→Dean consolidation:
 *   - College Dean is the top user-facing role.
 *   - Department Head can only touch subjects in their own department
 *     (enforced by SubjectsService.assertOwnership).
 *
 * `administrator` is intentionally absent from every @Roles() list.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/subjects')
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}

  // ──────────────────────────────────────────────
  // IMPORTANT: static-prefix routes MUST come before :id routes
  // ──────────────────────────────────────────────

  @Get()
  async findAll(@Query('includeInactive') includeInactive?: string) {
    const data =
      includeInactive === 'true'
        ? await this.subjects.findAllIncludingInactive()
        : await this.subjects.findAll();
    return { data };
  }

  // ── S-11 — Subject Restrictions (before :id) ──

  @Get('restrictions')
  async findAllRestrictions(@Query('termId') termId?: string) {
    return { data: await this.subjects.findAllRestrictions(termId) };
  }

  @Roles('college_dean', 'department_head')
  @Post('restrictions')
  async createRestriction(
    @Body() dto: CreateSubjectRestrictionDto,
    @Req() req: any,
  ) {
    return {
      data: await this.subjects.createRestriction(
        dto,
        req.user?.id,
        req.profile,
      ),
    };
  }

  @Roles('college_dean', 'department_head')
  @Patch('restrictions/:id')
  async updateRestriction(
    @Param('id') id: string,
    @Body() dto: UpdateSubjectRestrictionDto,
    @Req() req: any,
  ) {
    return {
      data: await this.subjects.updateRestriction(id, dto, req.profile),
    };
  }

  @Roles('college_dean', 'department_head')
  @Delete('restrictions/:id')
  async removeRestriction(@Param('id') id: string, @Req() req: any) {
    return this.subjects.removeRestriction(id, req.profile);
  }

  // ── Generic :id routes (AFTER static routes) ──

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { data: await this.subjects.findOne(id) };
  }

  @Roles('college_dean', 'department_head')
  @Post()
  async create(@Body() dto: CreateSubjectDto, @Req() req: any) {
    return { data: await this.subjects.create(dto, req.profile) };
  }

  @Roles('college_dean', 'department_head')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSubjectDto,
    @Req() req: any,
  ) {
    return { data: await this.subjects.update(id, dto, req.profile) };
  }

  @Roles('college_dean', 'department_head')
  @Patch(':id/toggle-active')
  async toggleActive(@Param('id') id: string, @Req() req: any) {
    return { data: await this.subjects.toggleActive(id, req.profile) };
  }

  @Roles('college_dean', 'department_head')
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.subjects.remove(id, req.profile);
  }
}