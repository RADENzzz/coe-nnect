import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { idpErrors } from './idp.errors';

/**
 * Pattern C device authentication (contract 6.5 / 8.2).
 *
 * The IDP desktop client sends:
 *   Authorization: Bearer <IDP_DEVICE_API_KEY>
 *   X-Request-ID: <optional correlation id>
 *
 * This is separate from the HMAC webhook secret. A missing configuration
 * fails closed so an unfinished deployment never accepts anonymous pushes.
 */
@Injectable()
export class IdpDeviceGuard implements CanActivate {
  private readonly logger = new Logger(IdpDeviceGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();

    if (req.method === 'OPTIONS') return true;

    req.idpRequestId = req.headers['x-request-id'] ?? null;
    req.idpDeviceId = req.headers['x-idp-device-id'] ?? null;

    const expected = this.config.get<string>('IDP_DEVICE_API_KEY')?.trim();
    if (!expected) {
      this.logger.error(
        'IDP_DEVICE_API_KEY is not set; rejecting every IDP desktop request.',
      );
      throw idpErrors.unauthorized(
        'IDP desktop access is not configured on this deployment.',
      );
    }

    const header = firstHeader(req.headers.authorization);
    const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
    if (!match) {
      throw idpErrors.unauthorized(
        'Missing Authorization: Bearer <IDP device key>.',
      );
    }

    const provided = match[1].trim();
    if (!isEqualSecret(expected, provided)) {
      this.logger.warn(
        'Rejected an IDP desktop request with an invalid device key.',
      );
      throw idpErrors.unauthorized('Invalid IDP device API key.');
    }

    return true;
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isEqualSecret(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
