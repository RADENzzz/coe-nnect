import { Equals, IsNumberString } from 'class-validator';

/**
 * The installed class-validator build does not export `IsTrue`. `Equals(true)`
 * has the same strict true-only semantics, behind the same decorator name.
 */
const IsTrue = () => Equals(true);

/** Read-only preflight of a published snapshot into a target term/department. */
export class PreflightReuseDto {
  @IsNumberString()
  termId: string;

  @IsNumberString()
  deptId: string;
}

/** Applying a reuse always requires an explicit confirmation. */
export class ApplyReuseDto extends PreflightReuseDto {
  @IsTrue()
  confirmed: boolean;
}
