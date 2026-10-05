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
import { ProspectusService } from './prospectus.service';
import { CreateProspectusDto } from './dto/create-prospectus.dto';
import { UpdateProspectusDto } from './dto/update-prospectus.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('v1/prospectus')
export class ProspectusController {
  constructor(private readonly prospectus: ProspectusService) {}

  // ─────────────────────────────────────────────
  // IMPORTANT: static-prefix routes MUST come
  // before `@Get(':id')`, otherwise Nest matches
  // them as `:id` and TypeORM tries to parse a
  // bigint from the literal string.
  // ─────────────────────────────────────────────

  @Get()
  async findAll() {
    return { data: await this.prospectus.findAll() };
  }

  @Get('by-program/:programId')
  async findByProgram(@Param('programId') programId: string) {
    return { data: await this.prospectus.findByProgram(programId) };
  }

  @Post()
  async create(@Body() dto: CreateProspectusDto) {
    return { data: await this.prospectus.create(dto) };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { data: await this.prospectus.findOne(id) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProspectusDto,
  ) {
    return { data: await this.prospectus.update(id, dto) };
  }

  @Patch(':id/toggle-active')
  async toggleActive(@Param('id') id: string) {
    return { data: await this.prospectus.toggleActive(id) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.prospectus.remove(id);
  }
}