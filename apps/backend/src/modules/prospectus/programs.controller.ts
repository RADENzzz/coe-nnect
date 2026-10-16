import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProspectusService } from './prospectus.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

/**
 * Thin read-only endpoint for the Prospectus UI's program dropdown.
 * Lives inside ProspectusModule so we don't need a separate ProgramsModule
 * until Program CRUD is actually built (deferred).
 */
@ApiTags('Prospectus')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtAuthGuard)
@Controller('v1/programs')
export class ProgramsController {
  constructor(private readonly prospectus: ProspectusService) {}

  @Get()
  async findAll() {
    return { data: await this.prospectus.listActivePrograms() };
  }
}