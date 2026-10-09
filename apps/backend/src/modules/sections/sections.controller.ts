import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SectionsService } from './sections.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/sections')
export class SectionsController {
  constructor(private readonly sections: SectionsService) {}

  @Get()
  async findAll() {
    return { data: await this.sections.findAll() };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { data: await this.sections.findOne(id) };
  }

  @Roles('administrator', 'department_head')
  @Post()
  async create(@Body() dto: CreateSectionDto, @Req() req: any) {
    return { data: await this.sections.create(dto, req.profile) };
  }

  @Roles('administrator', 'department_head')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSectionDto,
    @Req() req: any,
  ) {
    return { data: await this.sections.update(id, dto, req.profile) };
  }

  @Roles('administrator', 'department_head')
  @Patch(':id/toggle-active')
  async toggleActive(@Param('id') id: string, @Req() req: any) {
    return { data: await this.sections.toggleActive(id, req.profile) };
  }

  @Roles('administrator', 'department_head')
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.sections.remove(id, req.profile);
  }
}