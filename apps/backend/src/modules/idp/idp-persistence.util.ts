import { QueryFailedError } from 'typeorm';

/**
 * PostgreSQL unique-violation detection for TypeORM repositories.
 *
 * Used by the IDP event store and outbox to turn a concurrent insert race
 * into the idempotent answer instead of a 500.
 */
export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof QueryFailedError &&
    (err as QueryFailedError & { driverError?: { code?: string } }).driverError
      ?.code === '23505'
  );
}
