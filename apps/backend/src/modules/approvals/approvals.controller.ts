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
import { Auditable } from '../../common/decorators/auditable.decorator';

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

  @Auditable({ action: 'faculty_request.create', source: 'Approvals' })
  @Post()
  async create(@Body() dto: CreateFacultyRequestDto, @Req() req: any) {
    return { data: await this.approvals.create(dto, req.user.id) };
  }

  @Auditable({ action: 'faculty_request.approve', source: 'Approvals' })
  @Patch(':id/approve')
  async approve(
    @Param('id') id: string,
    @Body() dto: RespondFacultyRequestDto,
    @Req() req: any,
  ) {
    return { data: await this.approvals.approve(id, dto, req.user.id) };
  }
  
  @Auditable({ action: 'faculty_request.reject', source: 'Approvals' })
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