import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Auditable } from '../../common/decorators/auditable.decorator';

/**
 * User management.
 *
 * After the Admin→Dean consolidation:
 *   - The College Dean is the top user-facing role for user management.
 *   - The Department Head has read-only access to the directory
 *     (used by the Chat feature and cross-dept request forms).
 *
 * `administrator` is intentionally NOT listed here. The hidden dev
 * account uses it, but the API surface treats the Dean as the top
 * role.
 *
 * Route ordering: static-prefix routes (directory, me/password) MUST
 * be declared before parameterized `:id` routes or Nest will match
 * the literal segment as an ID.
 */
@ApiTags('Users')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('college_dean')
@Controller('v1/users')
export class UsersController {
  constructor(private service: UsersService) {}

  // ── Static-prefix routes (before @Get(':id')) ──

  @Get('directory')
  @Roles('college_dean', 'department_head')
  async findDirectory() {
    const data = await this.service.findDirectory();
    return { data };
  }

  /**
   * Self-service password change.
   *
   * Any authenticated user may change their OWN password. This route
   * overrides the class-level @Roles('college_dean') so DHs (and the
   * hidden dev account) can use it.
   *
   * Route ordering: declared before @Get(':id') — otherwise Nest
   * matches 'me' as a user ID.
   */
  @Post('me/password')
  @Roles('college_dean', 'department_head', 'administrator')
  @HttpCode(200)
  @Auditable({ action: 'user.password_changed', source: 'Users' })
  async changeOwnPassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    // JwtAuthGuard guarantees req.user is populated on this route.
    const userId: string = req.user.id;
    const userEmail: string = req.user.email;

    return this.service.changeOwnPassword(
      userId,
      userEmail,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  // ── Collection routes ──

  @Get()
  async findAll() {
    const data = await this.service.findAll();
    return { data };
  }

  @Auditable({ action: 'user.create', source: 'Users' })
  @Post()
  async create(@Body() dto: CreateUserDto, @Req() req: any) {
    const data = await this.service.create(dto, req.user?.id);
    return { data };
  }

  // ── Parameterized routes ──

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.service.findOne(id);
    return { data };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    const data = await this.service.update(id, dto);
    return { data };
  }

  @Patch(':id/toggle-active')
  async toggleActive(@Param('id') id: string, @Req() req: any) {
    const data = await this.service.toggleActive(id, req.user?.id);
    return { data };
  }

  @Auditable({ action: 'user.delete', source: 'Users' })
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return { success: true };
  }
}