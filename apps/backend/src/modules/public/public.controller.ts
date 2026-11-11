import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { PublicService } from './public.service';

/**
 * Public landing-page API.
 *
 * No authentication is required. These routes are intentionally separate from
 * the application API and return only published/aggregate/non-sensitive data.
 * Global rate limiting still applies.
 */
@ApiTags('Public')
@Controller('v1/public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('overview')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOperation({ summary: 'Public landing-page statistics' })
  async overview() {
    return { data: await this.publicService.getOverview() };
  }

  @Get('schedules')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiQuery({ name: 'termId', required: false })
  @ApiOperation({
    summary: 'Published schedule entries, optionally filtered by term',
  })
  async schedules(@Query('termId') termId?: string) {
    return { data: await this.publicService.getSchedules(termId) };
  }

  @Get('faculty')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiQuery({ name: 'departmentCode', required: false })
  @ApiQuery({ name: 'idpOnly', required: false, type: Boolean })
  @ApiOperation({
    summary: 'Public faculty directory with IDP connection status',
  })
  async faculty(
    @Query('departmentCode') departmentCode?: string,
    @Query('idpOnly') idpOnly?: string,
  ) {
    return {
      data: await this.publicService.getFaculty({
        departmentCode,
        idpOnly: idpOnly === 'true',
      }),
    };
  }

  @Get('integration')
  @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')
  @ApiOperation({
    summary:
      'Integration status for the IDP team — shape only, no credential values',
  })
  async integration() {
    return { data: await this.publicService.getIntegrationStatus() };
  }
}
