import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  ProspectusService,
  type ProspectusCaller,
} from './prospectus.service';
import { CreateProspectusDto } from './dto/create-prospectus.dto';
import { UpdateProspectusDto } from './dto/update-prospectus.dto';
import { FillSlotDto } from './dto/fill-slot.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Auditable } from '../../common/decorators/auditable.decorator';

function callerFromRequest(req: any): ProspectusCaller {
  const profile = req.profile;
  if (!profile) {
    throw new ForbiddenException('Profile not loaded.');
  }
  return {
    role: profile.role,
    deptId: profile.deptId != null ? String(profile.deptId) : null,
  };
}

@ApiTags('Prospectus')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/prospectus')
export class ProspectusController {
  constructor(private readonly prospectus: ProspectusService) {}

  // ─────────────────────────────────────────────
  // Reads
  // ─────────────────────────────────────────────

  @Get()
  async findAll() {
    return { data: await this.prospectus.findAll() };
  }

  @Get('by-program/:programId')
  async findByProgram(@Param('programId') programId: string) {
    return { data: await this.prospectus.findByProgram(programId) };
  }

  // NOTE: fill-slot must come BEFORE :id
  @Roles('college_dean', 'college_secretary', 'department_head')
  @Patch(':id/fill-slot')
  @Auditable({ action: 'prospectus.fill_slot', source: 'Prospectus' })
  async fillSlot(
    @Param('id') id: string,
    @Body() dto: FillSlotDto,
    @Req() req: any,
  ) {
    return {
      data: await this.prospectus.fillSlot(
        id,
        dto.subjectId,
        callerFromRequest(req),
      ),
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { data: await this.prospectus.findOne(id) };
  }

  // ─────────────────────────────────────────────
  // Writes
  // ─────────────────────────────────────────────

  @Roles('college_dean', 'college_secretary', 'department_head')
  @Post()
  async create(@Body() dto: CreateProspectusDto, @Req() req: any) {
    return {
      data: await this.prospectus.create(dto, callerFromRequest(req)),
    };
  }

  @Roles('college_dean', 'college_secretary', 'department_head')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProspectusDto,
    @Req() req: any,
  ) {
    return {
      data: await this.prospectus.update(id, dto, callerFromRequest(req)),
    };
  }

  @Roles('college_dean', 'college_secretary', 'department_head')
  @Patch(':id/toggle-active')
  async toggleActive(@Param('id') id: string, @Req() req: any) {
    return {
      data: await this.prospectus.toggleActive(id, callerFromRequest(req)),
    };
  }

  @Roles('college_dean', 'college_secretary', 'department_head')
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.prospectus.remove(id, callerFromRequest(req));
  }
}