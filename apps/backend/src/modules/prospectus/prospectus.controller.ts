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
import {
  ProspectusService,
  type ProspectusCaller,
} from './prospectus.service';
import { CreateProspectusDto } from './dto/create-prospectus.dto';
import { UpdateProspectusDto } from './dto/update-prospectus.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

/**
 * Build a ProspectusCaller from `req.profile`, which is attached by
 * RolesGuard after it loads the user from the DB.
 *
 * NOTE: RolesGuard only loads the profile when the route has a
 * `@Roles(...)` decorator. Every write route below has one, so by the
 * time these handlers run, `req.profile` is guaranteed to exist.
 */
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

/**
 * Prospectus management.
 *
 * After the Admin→Dean consolidation:
 *   - College Dean can manage prospectus entries for any program.
 *   - Department Head can only manage entries for programs in their
 *     own department (enforced in ProspectusService).
 *
 * `administrator` is intentionally absent from every @Roles() list.
 * The hidden dev account still bypasses program-ownership checks at
 * the service layer.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/prospectus')
export class ProspectusController {
  constructor(private readonly prospectus: ProspectusService) {}

  // ─────────────────────────────────────────────
  // Reads — no Roles decorator needed, so RolesGuard short-circuits
  // and profile isn't loaded (that's fine, reads are open to all auth users)
  // ─────────────────────────────────────────────

  @Get()
  async findAll() {
    return { data: await this.prospectus.findAll() };
  }

  @Get('by-program/:programId')
  async findByProgram(@Param('programId') programId: string) {
    return { data: await this.prospectus.findByProgram(programId) };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { data: await this.prospectus.findOne(id) };
  }

  // ─────────────────────────────────────────────
  // Writes — must have a @Roles decorator so RolesGuard loads the profile
  // ─────────────────────────────────────────────

  @Roles('college_dean', 'department_head')
  @Post()
  async create(@Body() dto: CreateProspectusDto, @Req() req: any) {
    return {
      data: await this.prospectus.create(dto, callerFromRequest(req)),
    };
  }

  @Roles('college_dean', 'department_head')
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

  @Roles('college_dean', 'department_head')
  @Patch(':id/toggle-active')
  async toggleActive(@Param('id') id: string, @Req() req: any) {
    return {
      data: await this.prospectus.toggleActive(id, callerFromRequest(req)),
    };
  }

  @Roles('college_dean', 'department_head')
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.prospectus.remove(id, callerFromRequest(req));
  }
}