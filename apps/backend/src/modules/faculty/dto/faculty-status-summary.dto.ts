import { IsOptional, IsNumberString } from 'class-validator';

export class FacultyStatusSummaryQueryDto {
  /** Optional — DHs get scoped automatically; Dean/Admin may pass this to narrow. */
  @IsOptional()
  @IsNumberString()
  deptId?: string;
}

/**
 * FR 3.1.3 — Bulk status row for the Faculty page's quick-filter chips.
 *
 * One row per faculty in scope. The frontend joins this by facultyId
 * against the faculty list to drive the chip filters and the Status column.
 */
export interface FacultyStatusSummaryRow {
  facultyId: string;
  qualificationCount: number;
  hasQualifications: boolean;
  preferenceCount: number;
  hasPreferences: boolean;
  unavailabilityCount: number;
  hasUnavailability: boolean;
}