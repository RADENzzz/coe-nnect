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
import { SemestersService } from './semesters.service';
import { CreateSemesterTypeDto } from './dto/create-semester-type.dto';
import { UpdateSemesterTypeDto } from './dto/update-semester-type.dto';
import { ReorderSemesterTypesDto } from './dto/reorder-semester-types.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Auditable } from '../../common/decorators/auditable.decorator';

/** Dean-managed catalog of semester types shared by every school year. */
@ApiTags('Semesters')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/semesters')
export class SemestersController {
  constructor(private readonly semesters: SemestersService) {}

  @Get()
  async findAll() {
    return { data: await this.semesters.findAll() };
  }

  // Static routes MUST come before :code.
  @Auditable({ action: 'semester.reorder', source: 'Semesters' })
  @Roles('college_dean', 'college_secretary')
  @Patch('reorder')
  async reorder(@Body() dto: ReorderSemesterTypesDto) {
    return { data: await this.semesters.reorder(dto.codes) };
  }

  @Auditable({ action: 'semester.update', source: 'Semesters' })
  @Roles('college_dean', 'college_secretary')
  @Patch(':code')
  async update(@Param('code') code: string, @Body() dto: UpdateSemesterTypeDto) {
    return { data: await this.semesters.update(code, dto) };
  }

  @Auditable({ action: 'semester.create', source: 'Semesters' })
  @Roles('college_dean', 'college_secretary')
  @Post()
  async create(@Body() dto: CreateSemesterTypeDto) {
    return { data: await this.semesters.create(dto) };
  }

  @Auditable({ action: 'semester.delete', source: 'Semesters' })
  @Roles('college_dean', 'college_secretary')
  @Delete(':code')
  async remove(@Param('code') code: string) {
    return this.semesters.remove(code);
  }
}
