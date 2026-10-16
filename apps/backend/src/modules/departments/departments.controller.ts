import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

/**
 * Department management.
 *
 * After the Admin→Dean consolidation:
 *   - College Dean has full department lifecycle control. The Dean
 *     inherits the admin capability.
 *   - Department Head does NOT manage departments.
 *
 * `administrator` is intentionally absent from every @Roles() list.
 *
 * NOTE per v21 §D2: the Dean is denied "delete another department's
 * data" in the sense of cross-department destructive actions, but
 * department CRUD itself stays available to them. The disallowed
 * action is a future feature — not this one.
 */
@ApiTags('Departments')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/departments')
export class DepartmentsController {
  constructor(private service: DepartmentsService) {}

  @Get()
  async findAll() {
    const data = await this.service.findAll();
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