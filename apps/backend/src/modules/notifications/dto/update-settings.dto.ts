import { IsBoolean, IsIn, IsString } from 'class-validator';
import { TRIGGER_KEYS } from '../triggers';

/**
 * Toggle a single trigger for the current user.
 */
export class UpdateSettingsDto {
  @IsString()
  @IsIn(Array.from(TRIGGER_KEYS))
  triggerKey!: string;

  @IsBoolean()
  enabled!: boolean;
}