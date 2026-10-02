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
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

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

  @Roles('administrator')
  @Post()
  async create(@Body() dto: CreateDepartmentDto) {
    const data = await this.service.create(dto);
    return { data };
  }

  @Roles('administrator')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    const data = await this.service.update(id, dto);
    return { data };
  }

  @Roles('administrator')
  @Patch(':id/toggle-active')
  async toggleActive(@Param('id') id: string) {
    const data = await this.service.toggleActive(id);
    return { data };
  }

  @Roles('administrator')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return { success: true };
  }
}