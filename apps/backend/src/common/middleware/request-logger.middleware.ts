import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

/**
 * Adds a correlation id and emits one structured request log line on finish.
 * Bodies, authorization headers, and query strings are intentionally omitted.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: any, res: any, next: () => void) {
    const incoming = req.headers?.['x-request-id'];
    const requestId =
      typeof incoming === 'string' && incoming.length <= 128
        ? incoming
        : randomUUID();

    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    const startedAt = Date.now();
    const method = req.method;
    const path = String(req.originalUrl ?? req.url ?? '').split('?')[0];

    res.on('finish', () => {
      this.logger.log({
        event: 'http_request',
        requestId,
        method,
        path,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
        userId: req.user?.id ?? null,
        ip: req.ip ?? null,
      });
    });

    next();
  }
}
