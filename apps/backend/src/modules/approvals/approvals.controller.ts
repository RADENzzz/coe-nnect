import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { CreateFacultyRequestDto } from './dto/create-faculty-request.dto';
import { RespondFacultyRequestDto } from './dto/respond-faculty-request.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/faculty-requests')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  async findAll(@Req() req: any) {
    return { data: await this.approvals.findAllForCurrentUser(req.user.id) };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { data: await this.approvals.findOne(id) };
  }

  @Post()
  async create(@Body() dto: CreateFacultyRequestDto, @Req() req: any) {
    return { data: await this.approvals.create(dto, req.user.id) };
  }

  @Patch(':id/approve')
  async approve(
    @Param('id') id: string,
    @Body() dto: RespondFacultyRequestDto,
    @Req() req: any,
  ) {
    return { data: await this.approvals.approve(id, dto, req.user.id) };
  }

  @Patch(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() dto: RespondFacultyRequestDto,
    @Req() req: any,
  ) {
    return { data: await this.approvals.reject(id, dto, req.user.id) };
  }

  @Delete(':id')
  async cancel(@Param('id') id: string, @Req() req: any) {
    return { data: await this.approvals.cancel(id, req.user.id) };
  }
}