import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Auditable } from '../../common/decorators/auditable.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrator')
@Controller('v1/users')
export class UsersController {
  constructor(private service: UsersService) {}

  @Get('directory')
  @Roles('administrator', 'college_dean', 'department_head')
  async findDirectory() {
    const data = await this.service.findDirectory();
    return { data };
  }

  @Get()
  async findAll() {
    const data = await this.service.findAll();
    return { data };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.service.findOne(id);
    return { data };
  }

  @Auditable({ action: 'user.create', source: 'Users' })
  @Post()
  async create(@Body() dto: CreateUserDto, @Req() req: any) {
    const data = await this.service.create(dto, req.user?.id);
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