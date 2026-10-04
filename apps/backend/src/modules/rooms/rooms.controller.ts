import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
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

  @Post()
  async create(@Body() dto: CreateRoomDto) {
    return { data: await this.rooms.create(dto) };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateRoomDto) {
    return { data: await this.rooms.update(id, dto) };
  }

  @Patch(':id/toggle-active')
  async toggleActive(@Param('id') id: string) {
    return { data: await this.rooms.toggleActive(id) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.rooms.remove(id);
  }
}