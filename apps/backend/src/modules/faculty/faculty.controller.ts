import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { FacultyService } from './faculty.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('v1/faculty')
export class FacultyController {
  constructor(private readonly faculty: FacultyService) {}

  @Get()
  async findAll() {
    return { data: await this.faculty.findAll() };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { data: await this.faculty.findOne(id) };
  }
}