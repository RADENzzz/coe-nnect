import { IsArray, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Internal DTO — created by the dispatcher, not exposed over HTTP.
 * Other modules call NotificationDispatcherService.dispatch(triggerKey, {...})
 * and the dispatcher builds one of these per recipient.
 */
export class CreateNotificationDto {
  /** Who receives it (single recipient per row — targeted model). */
  @IsUUID()
  recipientId!: string;

  /** Must be a key from TRIGGER_KEYS. Validated by the dispatcher. */
  @IsString()
  triggerKey!: string;

  /** Human-readable title shown in the bell + inbox. */
  @IsString()
  title!: string;

  /** Optional body text. */
  @IsString()
  @IsOptional()
  body?: string;

  /** Optional linked entity for deep-linking. */
  @IsString()
  @IsOptional()
  entityType?: string;

  @IsString()
  @IsOptional()
  entityId?: string;

  /** Free-form context (subject code, section code, reason, etc.). */
  @IsObject()
  @IsOptional()
  payload?: Record<string, unknown>;
}