import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Auditable } from '../../common/decorators/auditable.decorator';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/notifications')
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  // ═══════════════════════════════════════════════════════════
  // STATIC-PREFIX ROUTES — must come before parameterized
  // ═══════════════════════════════════════════════════════════

  @Get('unread-count')
  async unreadCount(@Req() req: any) {
    const userId = this.userIdOf(req);
    const count = await this.service.unreadCount(userId);
    return { data: { count } };
  }

  @Get('settings')
  async getSettings(@Req() req: any) {
    const userId = this.userIdOf(req);
    const data = await this.service.getSettings(userId);
    return { data };
  }

  @Patch('settings')
  @Auditable({ action: 'notification.settings_update', source: 'Notifications' })
  async updateSetting(@Body() dto: UpdateSettingsDto, @Req() req: any) {
    const userId = this.userIdOf(req);
    const data = await this.service.updateSetting(
      userId,
      dto.triggerKey,
      dto.enabled,
    );
    return { data };
  }

  @Post('read-all')
  @Auditable({ action: 'notification.read_all', source: 'Notifications' })
  async markAllAsRead(@Req() req: any) {
    const userId = this.userIdOf(req);
    const data = await this.service.markAllAsRead(userId);
    return { data };
  }

  @Delete('clear-all')
  @Auditable({ action: 'notification.clear_all', source: 'Notifications' })
  async clearAll(@Req() req: any) {
    const userId = this.userIdOf(req);
    const data = await this.service.clearAllForUser(userId);
    return { data };
  }

  // ═══════════════════════════════════════════════════════════
  // LIST
  // ═══════════════════════════════════════════════════════════

  @Get()
  async list(@Query() dto: ListNotificationsDto, @Req() req: any) {
    const userId = this.userIdOf(req);
    const data = await this.service.listForUser(userId, dto);
    return { data };
  }

  // ═══════════════════════════════════════════════════════════
  // PARAMETERIZED ROUTES
  // ═══════════════════════════════════════════════════════════

  @Patch(':id/read')
  @Auditable({ action: 'notification.read', source: 'Notifications' })
  async markRead(@Param('id') id: string, @Req() req: any) {
    const userId = this.userIdOf(req);
    await this.service.markAsRead(userId, id);
    return { data: { success: true } };
  }

  @Delete(':id')
  @Auditable({ action: 'notification.delete', source: 'Notifications' })
  async delete(@Param('id') id: string, @Req() req: any) {
    const userId = this.userIdOf(req);
    await this.service.deleteOne(userId, id);
    return { data: { success: true } };
  }

  // ═══════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════

  /**
   * Extract the user ID from the request.
   * The JWT strategy returns { id, email, role } on req.user.
   */
  private userIdOf(req: any): string {
    return req.user?.id;
  }
}