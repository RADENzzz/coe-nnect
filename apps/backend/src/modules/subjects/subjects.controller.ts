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
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('v1/subjects')
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}

  @Get()
  async findAll(@Query('includeInactive') includeInactive?: string) {
    const data =
      includeInactive === 'true'
        ? await this.subjects.findAllIncludingInactive()
        : await this.subjects.findAll();
    return { data };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { data: await this.subjects.findOne(id) };
  }

  @Post()
  async create(@Body() dto: CreateSubjectDto) {
    return { data: await this.subjects.create(dto) };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateSubjectDto) {
    return { data: await this.subjects.update(id, dto) };
  }

  @Patch(':id/toggle-active')
  async toggleActive(@Param('id') id: string) {
    return { data: await this.subjects.toggleActive(id) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.subjects.remove(id);
  }
}