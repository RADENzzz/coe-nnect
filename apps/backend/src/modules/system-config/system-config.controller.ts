import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { SystemConfigService } from './system-config.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/system-config')
export class SystemConfigController {
  constructor(private readonly config: SystemConfigService) {}

  // Any authenticated user can read settings (dean oversight)
  @Get()
  async getSettings() {
    return { data: await this.config.findAllSettings() };
  }

  // Only administrators can write
  @Roles('administrator')
  @Patch()
  async updateSettings(@Body() dto: UpdateSettingsDto) {
    return { data: await this.config.updateSettings(dto.settings) };
  }
}