// apps/backend/src/modules/departments/departments.controller.ts
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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Departments')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/departments')
export class DepartmentsController {
  constructor(private service: DepartmentsService) {}

  /**
   * List departments.
   *
   * Query param `includeInactive=true` — the Dean's "Manage Departments"
   * page needs this so an inactive dept is visible and can be
   * reactivated. DHs and pickers omit it (active only).
   */
  @Get()
  async findAll(@Query('includeInactive') includeInactive?: string) {
    const data = await this.service.findAll(includeInactive === 'true');
    return { data };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.service.findOne(id);
    return { data };
  }

  @Roles('college_dean')
  @Post()
  async create(@Body() dto: CreateDepartmentDto) {
    const data = await this.service.create(dto);
    return { data };
  }

  @Roles('college_dean')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    const data = await this.service.update(id, dto);
    return { data };
  }

  @Roles('college_dean')
  @Patch(':id/toggle-active')
  async toggleActive(@Param('id') id: string) {
    const data = await this.service.toggleActive(id);
    return { data };
  }

  @Roles('college_dean')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return { success: true };
  }
}