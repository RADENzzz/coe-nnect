import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../../modules/audit/audit.service';
import {
  AUDITABLE_KEY,
  AuditableOptions,
} from '../decorators/auditable.decorator';

/**
 * Writes an audit_trail row after a decorated handler resolves successfully.
 *
 * The row captures:
 *   - user_id      — req.user.id (set by JwtAuthGuard)
 *   - action       — from the @Auditable(...) decorator
 *   - source_system— from the @Auditable(...) decorator
 *   - affected_data — the request body plus a small success flag
 *
 * Failures to write are swallowed by AuditService.write() — the interceptor
 * never blocks the actual response.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const meta = this.reflector.getAllAndOverride<AuditableOptions>(
      AUDITABLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Not an audited endpoint — pass through
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest();
    const userId: string | null = req.user?.id ?? null;

    // Snapshot params we want — DO NOT include password fields
    const sanitizedParams = this.sanitize({
      params: req.params ?? {},
      query: req.query ?? {},
      body: req.body ?? {},
    });

    return next.handle().pipe(
      tap({
        next: () => {
          // Fire-and-forget. Failures are logged in AuditService.
          void this.audit.write({
            userId,
            action: meta.action,
            sourceSystem: meta.source,
            affectedData: sanitizedParams,
          });
        },
        // Deliberately not auditing errors — failed writes aren't mutations
      }),
    );
  }

  /**
   * Removes fields we never want to persist: passwords, tokens, keys.
   * Runs recursively so nested bodies are covered.
   */
  private sanitize(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map((v) => this.sanitize(v));
    if (typeof obj !== 'object') return obj;

    const SENSITIVE = new Set([
      'password',
      'newPassword',
      'oldPassword',
      'token',
      'accessToken',
      'refreshToken',
      'serviceRoleKey',
      'anonKey',
      'secret',
      'jwt',
      'authorization',
    ]);

    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SENSITIVE.has(k)) {
        out[k] = '[redacted]';
        continue;
      }
      out[k] = this.sanitize(v);
    }
    return out;
  }
}