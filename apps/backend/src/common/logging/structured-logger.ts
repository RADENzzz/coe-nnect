import { LogLevel, LoggerService } from '@nestjs/common';

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>,
    )) {
      out[key] = serialize(entry);
    }
    return out;
  }
  return value;
}

function normalizeMessage(message: unknown): unknown {
  if (typeof message === 'string') return message;
  try {
    return serialize(message);
  } catch {
    return String(message);
  }
}

/**
 * One JSON object per line. This keeps production logs ingestible by log
 * drains without adding a vendor SDK; `LOG_FORMAT=json` opts in locally too.
 */
export class StructuredLogger implements LoggerService {
  log(message: unknown, ...optionalParams: unknown[]) {
    this.write('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    this.write('error', message, optionalParams, true);
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]) {
    this.write('verbose', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]) {
    this.write('fatal', message, optionalParams, true);
  }

  private write(
    level: string,
    message: unknown,
    optionalParams: unknown[],
    stderr = false,
  ) {
    const params = [...optionalParams];
    let context: string | undefined;

    // Nest's Logger passes the context as the final string argument.
    const last = params[params.length - 1];
    if (typeof last === 'string' && last.length <= 80 && !last.includes('\n')) {
      context = last;
      params.pop();
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message: normalizeMessage(message),
      ...(params.length > 0 ? { details: params.map(serialize) } : {}),
    };

    const line = JSON.stringify(entry) + '\n';
    if (stderr) process.stderr.write(line);
    else process.stdout.write(line);
  }
}

export function createAppLogger(): LoggerService | LogLevel[] {
  const wantsJson =
    process.env.LOG_FORMAT === 'json' ||
    process.env.NODE_ENV === 'production';

  if (wantsJson) return new StructuredLogger();

  if (
    process.env.NODE_ENV === 'development' &&
    process.env.DEV_VERBOSE_LOGS !== 'true'
  ) {
    return ['error', 'warn', 'log', 'fatal'];
  }

  return ['error', 'warn', 'log', 'debug', 'verbose', 'fatal'];
}
