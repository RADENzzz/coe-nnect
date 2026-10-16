import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SystemConfigService } from './system-config.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Auditable } from '../../common/decorators/auditable.decorator';

/**
 * System configuration settings.
 *
 * After the Admin→Dean consolidation:
 *   - Any authenticated user can read settings.
 *   - College Dean can write. The Dean inherits the admin capability.
 *
 * `administrator` is intentionally absent from every @Roles() list.
 */
@ApiTags('System Config')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/system-config')
export class SystemConfigController {
  constructor(private readonly config: SystemConfigService) {}

  // Any authenticated user can read settings (dean oversight)
  @Get()
  async getSettings() {
    return { data: await this.config.findAllSettings() };
  }

  // Only the College Dean can write
  @Auditable({ action: 'system_config.update', source: 'SystemConfig' })
  @Roles('college_dean')
  @Patch()
  async updateSettings(@Body() dto: UpdateSettingsDto) {
    return { data: await this.config.updateSettings(dto.settings) };
  }
}