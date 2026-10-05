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

@UseGuards(JwtAuthGuard)
@Controller('v1/subjects')
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}

  // ──────────────────────────────────────────────
  // IMPORTANT: static-prefix routes MUST come before
  // `@Get(':id')` and `@Patch(':id')`, or Nest will
  // match them as :id and try to parse a bigint.
  // ──────────────────────────────────────────────

  @Get()
  async findAll(@Query('includeInactive') includeInactive?: string) {
    const data =
      includeInactive === 'true'
        ? await this.subjects.findAllIncludingInactive()
        : await this.subjects.findAll();
    return { data };
  }

  // ── S-11 — Subject Restrictions (must come before :id) ──

  @Get('restrictions')
  async findAllRestrictions(@Query('termId') termId?: string) {
    return { data: await this.subjects.findAllRestrictions(termId) };
  }

  @Post('restrictions')
  async createRestriction(
    @Body() dto: CreateSubjectRestrictionDto,
    @Req() req: any,
  ) {
    return {
      data: await this.subjects.createRestriction(dto, req.user?.id),
    };
  }

  @Patch('restrictions/:id')
  async updateRestriction(
    @Param('id') id: string,
    @Body() dto: UpdateSubjectRestrictionDto,
  ) {
    return { data: await this.subjects.updateRestriction(id, dto) };
  }

  @Delete('restrictions/:id')
  async removeRestriction(@Param('id') id: string) {
    return this.subjects.removeRestriction(id);
  }

  // ── Generic :id routes (must come AFTER static routes) ──

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { data: await this.subjects.findOne(id) };
  }

  @Post()
  async create(@Body() dto: CreateSubjectDto) {
    return { data: await this.subjects.create(dto) };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateSubjectDto) {
    return { data: await this.subjects.update(id, dto) };
  }

  @Patch(':id/toggle-active')
  async toggleActive(@Param('id') id: string) {
    return { data: await this.subjects.toggleActive(id) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.subjects.remove(id);
  }
}