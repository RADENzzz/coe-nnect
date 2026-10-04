import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { SectionsService } from './sections.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

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

  @Post()
  async create(@Body() dto: CreateSectionDto) {
    return { data: await this.sections.create(dto) };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateSectionDto) {
    return { data: await this.sections.update(id, dto) };
  }

  @Patch(':id/toggle-active')
  async toggleActive(@Param('id') id: string) {
    return { data: await this.sections.toggleActive(id) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.sections.remove(id);
  }
}