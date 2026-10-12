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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Auditable } from '../../common/decorators/auditable.decorator';

import {
  ProspectusPdfsService,
  UploadedPdfFile,
} from './prospectus-pdfs.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { UpdatePdfDto } from './dto/update-pdf.dto';
import { ExtractRequestDto, ImportConfirmDto } from './dto/extract.dto';

import type { User } from '../users/entities/user.entity';

interface RequestWithProfile extends Request {
  user: { id: string; email?: string };
  profile: User;
}

@Controller('v1/prospectus-pdfs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrator', 'college_dean', 'department_head')
export class ProspectusPdfsController {
  constructor(private readonly service: ProspectusPdfsService) {}

  // -----------------------------------------------------------
  // PDFs
  // -----------------------------------------------------------

  @Post()
  @Auditable({ action: 'prospectus_pdf.upload', source: 'Prospectus' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async upload(
    @UploadedFile() file: UploadedPdfFile,
    @Body('departmentId') departmentId: string,
    @Body('notes') notes: string | undefined,
    @Req() req: RequestWithProfile,
  ) {
    return this.service.upload(file, req.profile, departmentId, notes);
  }

  @Get()
  async list(
    @Query('departmentId') departmentId: string | undefined,
    @Req() req: RequestWithProfile,
  ) {
    return this.service.list(req.profile, departmentId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: RequestWithProfile) {
    return this.service.findOne(id, req.profile);
  }

  @Get(':id/signed-url')
  async getSignedUrl(
    @Param('id') id: string,
    @Req() req: RequestWithProfile,
  ) {
    return this.service.getSignedUrl(id, req.profile);
  }

  @Patch(':id')
  @Auditable({ action: 'prospectus_pdf.update', source: 'Prospectus' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePdfDto,
    @Req() req: RequestWithProfile,
  ) {
    return this.service.update(id, dto, req.profile);
  }

  @Delete(':id')
  @Auditable({ action: 'prospectus_pdf.delete', source: 'Prospectus' })
  async remove(@Param('id') id: string, @Req() req: RequestWithProfile) {
    await this.service.remove(id, req.profile);
    return { ok: true };
  }

  // -----------------------------------------------------------
  // Tables
  // -----------------------------------------------------------

  @Post(':id/tables')
  @Auditable({
    action: 'prospectus_pdf_table.create',
    source: 'Prospectus',
  })
  async createTable(
    @Param('id') id: string,
    @Body() dto: CreateTableDto,
    @Req() req: RequestWithProfile,
  ) {
    return this.service.createTable(id, dto, req.profile);
  }

  @Patch(':id/tables/:tid')
  @Auditable({
    action: 'prospectus_pdf_table.update',
    source: 'Prospectus',
  })
  async updateTable(
    @Param('id') id: string,
    @Param('tid') tid: string,
    @Body() dto: UpdateTableDto,
    @Req() req: RequestWithProfile,
  ) {
    return this.service.updateTable(id, tid, dto, req.profile);
  }

  @Delete(':id/tables/:tid')
  @Auditable({
    action: 'prospectus_pdf_table.delete',
    source: 'Prospectus',
  })
  async deleteTable(
    @Param('id') id: string,
    @Param('tid') tid: string,
    @Req() req: RequestWithProfile,
  ) {
    await this.service.deleteTable(id, tid, req.profile);
    return { ok: true };
  }

  // -----------------------------------------------------------
  // Extract + Import
  // -----------------------------------------------------------

  @Post(':id/extract')
  async extract(
    @Param('id') id: string,
    @Body() dto: ExtractRequestDto,
    @Req() req: RequestWithProfile,
  ) {
    const tableIds = dto.table_ids?.map(String);
    return this.service.extract(id, tableIds, req.profile);
  }

  @Post(':id/import')
  @Auditable({ action: 'prospectus_pdf.import', source: 'Prospectus' })
  async confirmImport(
    @Param('id') id: string,
    @Body() dto: ImportConfirmDto,
    @Req() req: RequestWithProfile,
  ) {
    return this.service.confirmImport(id, dto, req.profile);
  }
}