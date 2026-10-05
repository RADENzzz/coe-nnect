import { IsObject } from 'class-validator';

export class UpdateSettingsDto {
  /**
   * A map of setting_key → new value.
   * Example: { "operating_hours_start": "07:30", "max_consecutive_hours": 4 }
   *
   * Validation of individual values is done in the service so we can
   * apply type-specific rules (times must be HH:MM, numbers must be > 0, etc.)
   */
  @IsObject()
  settings: Record<string, unknown>;
}