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
import { FacultyService } from './faculty.service';
import { CreateFacultyDto } from './dto/create-faculty.dto';
import { UpdateFacultyDto } from './dto/update-faculty.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('v1/faculty')
export class FacultyController {
  constructor(private readonly faculty: FacultyService) {}

  @Get()
  async findAll(@Query('includeInactive') includeInactive?: string) {
    const data =
      includeInactive === 'true'
        ? await this.faculty.findAllIncludingInactive()
        : await this.faculty.findAll();
    return { data };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { data: await this.faculty.findOne(id) };
  }

  @Post()
  async create(@Body() dto: CreateFacultyDto) {
    return { data: await this.faculty.create(dto) };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateFacultyDto) {
    return { data: await this.faculty.update(id, dto) };
  }

  @Patch(':id/toggle-active')
  async toggleActive(@Param('id') id: string) {
    return { data: await this.faculty.toggleActive(id) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.faculty.remove(id);
  }
}