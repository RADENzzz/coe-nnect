import { IsBoolean, IsOptional } from 'class-validator';

export class ResetDemoDto {
  /** When true, run the demo seed immediately after the hard reset. */
  @IsOptional()
  @IsBoolean()
  reseed?: boolean;

  /**
   * When true, also run the full demo-data seed (Level A) after the base
   * seed. `full: true` implies `reseed: true` — the reset always runs
   * first, then base seed, then full seed.
   */
  @IsOptional()
  @IsBoolean()
  full?: boolean;
}