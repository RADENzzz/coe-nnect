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
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  async findAll(@Query('includeInactive') includeInactive?: string) {
    const data =
      includeInactive === 'true'
        ? await this.rooms.findAllIncludingInactive()
        : await this.rooms.findAll();
    return { data };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { data: await this.rooms.findOne(id) };
  }

  @Roles('administrator', 'department_head')
  @Post()
  async create(@Body() dto: CreateRoomDto, @Req() req: any) {
    return { data: await this.rooms.create(dto, req.profile) };
  }

  @Roles('administrator', 'department_head')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
    @Req() req: any,
  ) {
    return { data: await this.rooms.update(id, dto, req.profile) };
  }

  @Roles('administrator', 'department_head')
  @Patch(':id/toggle-active')
  async toggleActive(@Param('id') id: string, @Req() req: any) {
    return { data: await this.rooms.toggleActive(id, req.profile) };
  }

  @Roles('administrator', 'department_head')
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.rooms.remove(id, req.profile);
  }
}