import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Lightweight liveness probe for Railway (and any other orchestrator).
 *
 * PUBLIC. No auth and no database access: a healthcheck should answer as soon
 * as the HTTP server is accepting requests. Dependency readiness is covered by
 * the existing /v1/system-status endpoint.
 */
@ApiTags('Health')
@Controller('v1/health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  check() {
    return {
      status: 'ok',
      service: 'coe-nnect-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
