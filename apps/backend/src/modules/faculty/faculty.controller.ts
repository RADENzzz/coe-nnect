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
import { FacultyService } from './faculty.service';
import { CreateFacultyDto } from './dto/create-faculty.dto';
import { UpdateFacultyDto } from './dto/update-faculty.dto';
import { CreateQualificationDto } from './dto/create-qualification.dto';
import { UpdateQualificationDto } from './dto/update-qualification.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Auditable } from '../../common/decorators/auditable.decorator';
import { CreateFacultyPreferenceDto } from './dto/create-faculty-preference.dto';
import { UpdateFacultyPreferenceDto } from './dto/update-faculty-preference.dto';
import { CreateFacultyUnavailabilityDto } from './dto/create-faculty-unavailability.dto';
import { UpdateFacultyUnavailabilityDto } from './dto/update-faculty-unavailability.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/faculty')
export class FacultyController {
  constructor(private readonly faculty: FacultyService) {}

  // ─────────────────────────────────────────────
  // IMPORTANT: static / nested routes MUST come
  // before `@Get(':id')` and `@Patch(':id')`.
  // ─────────────────────────────────────────────

  @Get()
  async findAll(@Query('includeInactive') includeInactive?: string) {
    const data =
      includeInactive === 'true'
        ? await this.faculty.findAllIncludingInactive()
        : await this.faculty.findAll();
    return { data };
  }

  // ── Qualifications ──

  @Get(':id/qualifications')
  async findQualifications(@Param('id') id: string) {
    return { data: await this.faculty.findQualifications(id) };
  }

  @Roles('administrator', 'department_head')
  @Post(':id/qualifications')
  async addQualification(
    @Param('id') id: string,
    @Body() dto: CreateQualificationDto,
    @Req() req: any,
  ) {
    return { data: await this.faculty.addQualification(id, dto, req.profile) };
  }

  @Roles('administrator', 'department_head')
  @Patch(':id/qualifications/:qualId')
  async updateQualification(
    @Param('id') id: string,
    @Param('qualId') qualId: string,
    @Body() dto: UpdateQualificationDto,
    @Req() req: any,
  ) {
    return {
      data: await this.faculty.updateQualification(id, qualId, dto, req.profile),
    };
  }

  @Roles('administrator', 'department_head')
  @Delete(':id/qualifications/:qualId')
  async removeQualification(
    @Param('id') id: string,
    @Param('qualId') qualId: string,
    @Req() req: any,
  ) {
    return this.faculty.removeQualification(id, qualId, req.profile);
  }

  // ── Preferences ──

  @Get(':id/preferences')
  async findPreferences(@Param('id') id: string) {
    return { data: await this.faculty.findPreferences(id) };
  }

  @Roles('administrator', 'department_head')
  @Post(':id/preferences')
  async addPreference(
    @Param('id') id: string,
    @Body() dto: CreateFacultyPreferenceDto,
    @Req() req: any,
  ) {
    return { data: await this.faculty.addPreference(id, dto, req.profile) };
  }

  @Roles('administrator', 'department_head')
  @Patch(':id/preferences/:preferenceId')
  async updatePreference(
    @Param('id') id: string,
    @Param('preferenceId') preferenceId: string,
    @Body() dto: UpdateFacultyPreferenceDto,
    @Req() req: any,
  ) {
    return {
      data: await this.faculty.updatePreference(
        id,
        preferenceId,
        dto,
        req.profile,
      ),
    };
  }

  @Roles('administrator', 'department_head')
  @Delete(':id/preferences/:preferenceId')
  async removePreference(
    @Param('id') id: string,
    @Param('preferenceId') preferenceId: string,
    @Req() req: any,
  ) {
    return this.faculty.removePreference(id, preferenceId, req.profile);
  }

  // ═══════════════════════════════════════════════════════════
  // FACULTY UNAVAILABILITY — must come before @Get(':id')
  // ═══════════════════════════════════════════════════════════

  @Get(':id/unavailability')
  @Roles('administrator', 'college_dean', 'department_head')
  async findUnavailability(
    @Param('id') id: string,
    @Query('termId') termId?: string,
  ) {
    const data = await this.faculty.findUnavailability(id, termId);
    return { data };
  }

  @Post(':id/unavailability')
  @Roles('administrator', 'department_head')
  @Auditable({
    action: 'faculty.unavailability.create',
    source: 'Faculty',
  })
  async addUnavailability(
    @Param('id') id: string,
    @Body() dto: CreateFacultyUnavailabilityDto,
  ) {
    const data = await this.faculty.addUnavailability(id, dto);
    return { data };
  }

  @Patch(':id/unavailability/:uid')
  @Roles('administrator', 'department_head')
  @Auditable({
    action: 'faculty.unavailability.update',
    source: 'Faculty',
  })
  async updateUnavailability(
    @Param('id') id: string,
    @Param('uid') uid: string,
    @Body() dto: UpdateFacultyUnavailabilityDto,
  ) {
    const data = await this.faculty.updateUnavailability(id, uid, dto);
    return { data };
  }

  @Delete(':id/unavailability/:uid')
  @Roles('administrator', 'department_head')
  @Auditable({
    action: 'faculty.unavailability.delete',
    source: 'Faculty',
  })
  async removeUnavailability(
    @Param('id') id: string,
    @Param('uid') uid: string,
  ) {
    const data = await this.faculty.removeUnavailability(id, uid);
    return { data };
  }

  // ── Generic :id routes ──

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { data: await this.faculty.findOne(id) };
  }

  @Roles('administrator', 'department_head')
  @Post()
  async create(@Body() dto: CreateFacultyDto, @Req() req: any) {
    return { data: await this.faculty.create(dto, req.profile) };
  }

  @Roles('administrator', 'department_head')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateFacultyDto,
    @Req() req: any,
  ) {
    return { data: await this.faculty.update(id, dto, req.profile) };
  }

  @Roles('administrator', 'department_head')
  @Patch(':id/toggle-active')
  async toggleActive(@Param('id') id: string, @Req() req: any) {
    return { data: await this.faculty.toggleActive(id, req.profile) };
  }

  // ⚠️ NOTE: `@Delete(':id')` still restricted to administrator only.
  // If you want DHs to delete faculty in their own dept, change this to:
  //   @Roles('administrator', 'department_head')
  // The service-side assertOwnership already enforces dept ownership,
  // so widening the role list is safe if you want it.
  @Roles('administrator')
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.faculty.remove(id, req.profile);
  }
}