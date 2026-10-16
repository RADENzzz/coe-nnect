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
import { SystemConfigService } from './system-config.service';
import { CreateDesignationDto } from './dto/create-designation.dto';
import { UpdateDesignationDto } from './dto/update-designation.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

/**
 * Designation management (FR 7.1.4).
 *
 * After the Admin→Dean consolidation:
 *   - College Dean can manage designations and release hours.
 *   - Department Head can read but not write.
 *
 * `administrator` is intentionally absent from every @Roles() list.
 */
@ApiTags('System Config')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/designations')
export class DesignationsController {
  constructor(private readonly config: SystemConfigService) {}

  @Get()
  async findAll() {
    return { data: await this.config.findAllDesignations() };
  }

  @Roles('college_dean')
  @Post()
  async create(@Body() dto: CreateDesignationDto) {
    return { data: await this.config.createDesignation(dto) };
  }

  @Roles('college_dean')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDesignationDto,
  ) {
    return { data: await this.config.updateDesignation(id, dto) };
  }

  @Roles('college_dean')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.config.removeDesignation(id);
  }
}