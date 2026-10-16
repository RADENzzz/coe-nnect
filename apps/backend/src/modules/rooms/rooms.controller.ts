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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { CreateRoomPreferenceDto } from './dto/room-preference.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

/**
 * Room management.
 *
 * After the Admin→Dean consolidation:
 *   - College Dean is the top user-facing role.
 *   - Department Head can edit rooms owned by their own department or
 *     shared (dept_id IS NULL) rooms — enforced in RoomsService.
 *
 * `administrator` is intentionally absent from every @Roles() list.
 */
@ApiTags('Rooms')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  // ════════════════════════════════════════════
  // STATIC-PREFIX ROUTES (must precede :id)
  // ════════════════════════════════════════════

  @Get()
  async findAll(@Query('includeInactive') includeInactive?: string) {
    const data =
      includeInactive === 'true'
        ? await this.rooms.findAllIncludingInactive()
        : await this.rooms.findAll();
    return { data };
  }

  // ── ROOM PREFERENCES (F3) ──

  /**
   * Bulk endpoint: every preference across every shared room.
   * Used by the Rooms page to compute the "Preferred" tile count and
   * to flag preferred rows, in one round-trip.
   *
   * MUST be declared before `preferences/:id` and before the `:id`
   * catchall — Nest resolves in declaration order.
   */
  @Get('preferences/all')
  @Roles('college_dean', 'department_head')
  async listAllPreferences() {
    const data = await this.rooms.findAllPreferences();
    return { data };
  }

  @Get('preferences')
  @Roles('college_dean', 'department_head')
  async listPreferences(@Query('roomId') roomId: string, @Req() req: any) {
    const data = await this.rooms.findPreferencesForRoom(
      roomId,
      req.profile,
    );
    return { data };
  }

  @Post('preferences')
  @Roles('college_dean', 'department_head')
  async upsertPreference(
    @Body() dto: CreateRoomPreferenceDto,
    @Req() req: any,
  ) {
    const data = await this.rooms.upsertPreference(dto, req.profile);
    return { data };
  }

  @Delete('preferences/:id')
  @Roles('college_dean', 'department_head')
  async removePreference(@Param('id') id: string, @Req() req: any) {
    return this.rooms.removePreference(id, req.profile);
  }

  // ════════════════════════════════════════════
  // PARAMETERIZED :id ROUTES (must come after)
  // ════════════════════════════════════════════

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { data: await this.rooms.findOne(id) };
  }

  @Roles('college_dean', 'department_head')
  @Post()
  async create(@Body() dto: CreateRoomDto, @Req() req: any) {
    return { data: await this.rooms.create(dto, req.profile) };
  }

  @Roles('college_dean', 'department_head')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
    @Req() req: any,
  ) {
    return { data: await this.rooms.update(id, dto, req.profile) };
  }

  @Roles('college_dean', 'department_head')
  @Patch(':id/toggle-active')
  async toggleActive(@Param('id') id: string, @Req() req: any) {
    return { data: await this.rooms.toggleActive(id, req.profile) };
  }

  @Roles('college_dean', 'department_head')
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.rooms.remove(id, req.profile);
  }
}