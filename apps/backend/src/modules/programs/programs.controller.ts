import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  ProgramsService,
  type ProgramCaller,
} from './programs.service';
import { CreateProgramDto } from './dto/create-program.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

/**
 * Build a ProgramCaller from `req.profile`, which RolesGuard attaches
 * after loading the user. Only write routes have @Roles(), and those are
 * exactly the routes that call this helper.
 */
function callerFromRequest(req: any): ProgramCaller {
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
 * Program (degree program) management.
 *
 *   - Reads are open to any authenticated user (pickers need them).
 *   - Writes are limited to the college dean and department heads.
 *   - `?includeInactive=true` returns deactivated programs too; the
 *     management page uses it, every picker omits it.
 */
@ApiTags('Programs')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/programs')
export class ProgramsController {
  constructor(private readonly programs: ProgramsService) {}

  @Get()
  async findAll(@Query('includeInactive') includeInactive?: string) {
    return {
      data:
        includeInactive === 'true'
          ? await this.programs.findAll()
          : await this.programs.findActive(),
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { data: await this.programs.findOne(id) };
  }

  @Roles('college_dean', 'department_head')
  @Post()
  async create(@Body() dto: CreateProgramDto, @Req() req: any) {
    return { data: await this.programs.create(dto, callerFromRequest(req)) };
  }

  @Roles('college_dean', 'department_head')
  @Patch(':id/toggle-active')
  async toggleActive(@Param('id') id: string, @Req() req: any) {
    return {
      data: await this.programs.toggleActive(id, callerFromRequest(req)),
    };
  }

  @Roles('college_dean', 'department_head')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProgramDto,
    @Req() req: any,
  ) {
    return {
      data: await this.programs.update(id, dto, callerFromRequest(req)),
    };
  }
}
