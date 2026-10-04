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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrator')
@Controller('v1/users')
export class UsersController {
  constructor(private service: UsersService) {}

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

  @Post()
  async create(@Body() dto: CreateUserDto) {
    const data = await this.service.create(dto);
    return { data };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    const data = await this.service.update(id, dto);
    return { data };
  }

  @Patch(':id/toggle-active')
  async toggleActive(@Param('id') id: string) {
    const data = await this.service.toggleActive(id);
    return { data };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return { success: true };
  }
}