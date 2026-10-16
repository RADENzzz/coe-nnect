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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TermsService } from './terms.service';
import { CreateTermDto } from './dto/create-term.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Auditable } from '../../common/decorators/auditable.decorator';

/**
 * Term management.
 *
 * After the Admin→Dean consolidation:
 *   - College Dean has full term lifecycle control (create, activate,
 *     deactivate, delete). The Dean inherits the admin capability.
 *   - Department Head does NOT manage terms.
 *
 * `administrator` is intentionally absent from every @Roles() list.
 */
@ApiTags('Terms')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('v1/terms')
export class TermsController {
  constructor(private readonly terms: TermsService) {}

  // Static routes MUST come before :id
  @Get()
  async findAll() {
    return { data: await this.terms.findAll() };
  }

  @Get('active')
  async findActive() {
    return { data: await this.terms.findActive() };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { data: await this.terms.findOne(id) };
  }

  @Auditable({ action: 'term.create', source: 'Terms' })
  @Roles('college_dean')
  @Post()
  async create(@Body() dto: CreateTermDto) {
    return { data: await this.terms.create(dto) };
  }

  @Auditable({ action: 'term.deactivate', source: 'Terms' })
  @Roles('college_dean')
  @Patch(':id/deactivate')
  async deactivate(@Param('id') id: string) {
    return { data: await this.terms.deactivate(id) };
  }

  @Auditable({ action: 'term.activate', source: 'Terms' })
  @Roles('college_dean')
  @Patch(':id/activate')
  async activate(@Param('id') id: string) {
    return { data: await this.terms.activate(id) };
  }

  @Auditable({ action: 'term.delete', source: 'Terms' })
  @Roles('college_dean')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.terms.remove(id);
  }
}