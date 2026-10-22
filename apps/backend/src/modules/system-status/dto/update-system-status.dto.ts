import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export const SYSTEM_STATUS_SEVERITIES = [
  'info',
  'warning',
  'critical',
  'maintenance',
] as const;

export class UpdateSystemStatusDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(SYSTEM_STATUS_SEVERITIES)
  severity?: (typeof SYSTEM_STATUS_SEVERITIES)[number];

  @ValidateIf((o) => o.enabled === true)
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string | null;
}
