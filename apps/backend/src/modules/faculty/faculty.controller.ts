import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FacultyService } from './faculty.service';
import { CreateFacultyDto } from './dto/create-faculty.dto';
import { UpdateFacultyDto } from './dto/update-faculty.dto';
import { CreateQualificationDto } from './dto/create-qualification.dto';
import { UpdateQualificationDto } from './dto/update-qualification.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateFacultyPreferenceDto } from './dto/create-faculty-preference.dto';
import { UpdateFacultyPreferenceDto } from './dto/update-faculty-preference.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/faculty')
export class FacultyController {
  constructor(private readonly faculty: FacultyService) {}

  // ─────────────────────────────────────────────
  // IMPORTANT: static / nested routes MUST come
  // before `@Get(':id')` and `@Patch(':id')`, or
  // Nest will match them as `:id` and TypeORM
  // will try to parse a bigint.
  // ─────────────────────────────────────────────

  @Get()
  async findAll(@Query('includeInactive') includeInactive?: string) {
    const data =
      includeInactive === 'true'
        ? await this.faculty.findAllIncludingInactive()
        : await this.faculty.findAll();
    return { data };
  }

  // ── Qualifications (must come before `:id`) ──

  @Get(':id/qualifications')
  async findQualifications(@Param('id') id: string) {
    return { data: await this.faculty.findQualifications(id) };
  }

  @Roles('administrator', 'department_head')
  @Post(':id/qualifications')
  async addQualification(
    @Param('id') id: string,
    @Body() dto: CreateQualificationDto,
  ) {
    return { data: await this.faculty.addQualification(id, dto) };
  }

  @Roles('administrator', 'department_head')
  @Patch(':id/qualifications/:qualId')
  async updateQualification(
    @Param('id') id: string,
    @Param('qualId') qualId: string,
    @Body() dto: UpdateQualificationDto,
  ) {
    return {
      data: await this.faculty.updateQualification(id, qualId, dto),
    };
  }

  @Roles('administrator', 'department_head')
  @Delete(':id/qualifications/:qualId')
  async removeQualification(
    @Param('id') id: string,
    @Param('qualId') qualId: string,
  ) {
    return this.faculty.removeQualification(id, qualId);
  }

  // ── Preferences (must come before `:id`)

  @Get(':id/preferences')
  async findPreferences(@Param('id') id: string) {
    return { data: await this.faculty.findPreferences(id) };
  }

  @Roles('administrator', 'department_head')
  @Post(':id/preferences')
  async addPreference(
    @Param('id') id: string,
    @Body() dto: CreateFacultyPreferenceDto,
  ) {
    return { data: await this.faculty.addPreference(id, dto) };
  }

  @Roles('administrator', 'department_head')
  @Patch(':id/preferences/:preferenceId')
  async updatePreference(
    @Param('id') id: string,
    @Param('preferenceId') preferenceId: string,
    @Body() dto: UpdateFacultyPreferenceDto,
  ) {
    return {
      data: await this.faculty.updatePreference(id, preferenceId, dto),
    };
  }

  @Roles('administrator', 'department_head')
  @Delete(':id/preferences/:preferenceId')
  async removePreference(
    @Param('id') id: string,
    @Param('preferenceId') preferenceId: string,
  ) {
    return this.faculty.removePreference(id, preferenceId);
  }

  // ── Generic :id routes ──

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { data: await this.faculty.findOne(id) };
  }

  @Roles('administrator', 'department_head')
  @Post()
  async create(@Body() dto: CreateFacultyDto) {
    return { data: await this.faculty.create(dto) };
  }

  @Roles('administrator', 'department_head')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateFacultyDto) {
    return { data: await this.faculty.update(id, dto) };
  }

  @Roles('administrator', 'department_head')
  @Patch(':id/toggle-active')
  async toggleActive(@Param('id') id: string) {
    return { data: await this.faculty.toggleActive(id) };
  }

  @Roles('administrator')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.faculty.remove(id);
  }
}