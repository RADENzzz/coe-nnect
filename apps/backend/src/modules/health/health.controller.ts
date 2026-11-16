import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';

/**
 * Railway sets this on GitHub-triggered deployments. Keeping it on the public
 * liveness response makes it easy to confirm which commit production runs.
 */
const DEPLOY_COMMIT =
  process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ||
  process.env.GIT_COMMIT_SHA?.trim() ||
  null;

/**
 * Lightweight liveness probe for Railway (and any other orchestrator).
 *
 * PUBLIC. No auth and no database access: a healthcheck should answer as soon
 * as the HTTP server is accepting requests. Dependency readiness is covered by
 * the existing /v1/system-status endpoint.
 */
@ApiTags('Health')
@Public()
@Controller('v1/health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  check() {
    return {
      status: 'ok',
      service: 'coe-nnect-backend',
      commit: DEPLOY_COMMIT,
      timestamp: new Date().toISOString(),
    };
  }
}
