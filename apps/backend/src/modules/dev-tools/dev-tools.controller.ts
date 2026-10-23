import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DevToolsService } from './dev-tools.service';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { RenameUserDto } from './dto/rename-user.dto';
import { ResetDemoDto } from './dto/reset-demo.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Auditable } from '../../common/decorators/auditable.decorator';

@ApiTags('Dev Tools')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrator')
@Controller('v1/dev-tools')
export class DevToolsController {
  constructor(private readonly service: DevToolsService) {}

  @Get('state')
  async getState() {
    const data = await this.service.getSystemState();
    return { data };
  }

  @Post('seed')
  @HttpCode(202)
  @Auditable({ action: 'dev.seed', source: 'DevTools' })
  async startSeed() {
    const data = await this.service.startSeed();
    return { data };
  }

  @Post('reset')
  @HttpCode(202)
  // Intentionally not @Auditable: the reset truncates audit_trail, so a
  // fire-and-forget audit row written after this handler would leave the
  // freshly reset database with a stray entry.
  async startReset(@Req() req: any, @Body() dto: ResetDemoDto) {
    const data = await this.service.startReset(
      req.profile.userId,
      dto?.reseed === true,
    );
    return { data };
  }

  @Get('jobs/:jobId')
  async getJob(@Param('jobId') jobId: string) {
    const data = this.service.getJobStatus(jobId);
    return { data };
  }

  @Get('users')
  async listUsers() {
    const data = await this.service.listUsers();
    return { data };
  }

  @Post('users/:userId/password')
  @HttpCode(200)
  @Auditable({ action: 'dev.user.reset_password', source: 'DevTools' })
  async resetPassword(
    @Param('userId') userId: string,
    @Body() dto: ResetUserPasswordDto,
  ) {
    const data = await this.service.resetUserPassword(userId, dto.newPassword);
    return { data };
  }

  @Post('users/:userId/username')
  @HttpCode(200)
  @Auditable({ action: 'dev.user.rename', source: 'DevTools' })
  async renameUser(
    @Param('userId') userId: string,
    @Body() dto: RenameUserDto,
  ) {
    const data = await this.service.renameUser(userId, dto.newUsername);
    return { data };
  }

  @Patch('users/:userId/toggle-active')
  @HttpCode(200)
  @Auditable({ action: 'dev.user.toggle_active', source: 'DevTools' })
  async toggleActive(
    @Param('userId') userId: string,
    @Req() req: any, // <-- req.profile is attached by JwtAuthGuard/RolesGuard
  ) {
    // req.profile.userId is the logged-in dev account's ID
    const data = await this.service.toggleUserActive(userId, req.profile.userId);
    return { data };
  }
}