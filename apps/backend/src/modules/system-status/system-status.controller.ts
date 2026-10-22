import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SystemStatusService } from './system-status.service';
import { UpdateSystemStatusDto } from './dto/update-system-status.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Auditable } from '../../common/decorators/auditable.decorator';

@ApiTags('System Status')
@Controller('v1/system-status')
export class SystemStatusController {
  constructor(private readonly service: SystemStatusService) {}

  /**
   * PUBLIC. No auth. The login page calls this before the user has a
   * session, so it must be reachable anonymously.
   */
  @Get()
  async get() {
    const data = await this.service.getPublic();
    return { data };
  }

  /**
   * ADMINISTRATOR ONLY. Hidden dev/Dean dev-tools account writes here.
   */
  @ApiBearerAuth('supabase-jwt')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('administrator')
  @Auditable({ action: 'system_status.update', source: 'SystemStatus' })
  @Patch()
  async update(
    @Body() dto: UpdateSystemStatusDto,
    @Req() req: any,
  ) {
    const data = await this.service.update(dto, req.profile.userId);
    return { data };
  }
}