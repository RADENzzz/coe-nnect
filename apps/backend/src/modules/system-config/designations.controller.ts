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
import { SystemConfigService } from './system-config.service';
import { CreateDesignationDto } from './dto/create-designation.dto';
import { UpdateDesignationDto } from './dto/update-designation.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/designations')
export class DesignationsController {
  constructor(private readonly config: SystemConfigService) {}

  @Get()
  async findAll() {
    return { data: await this.config.findAllDesignations() };
  }

  @Roles('administrator')
  @Post()
  async create(@Body() dto: CreateDesignationDto) {
    return { data: await this.config.createDesignation(dto) };
  }

  @Roles('administrator')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDesignationDto,
  ) {
    return { data: await this.config.updateDesignation(id, dto) };
  }

  @Roles('administrator')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.config.removeDesignation(id);
  }
}