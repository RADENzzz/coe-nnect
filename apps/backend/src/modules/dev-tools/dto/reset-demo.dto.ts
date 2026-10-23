import { IsBoolean, IsOptional } from 'class-validator';

export class ResetDemoDto {
  /** When true, run the demo seed immediately after the hard reset. */
  @IsOptional()
  @IsBoolean()
  reseed?: boolean;
}
