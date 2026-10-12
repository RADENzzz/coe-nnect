import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';

/**
 * Resolves recipient user IDs for notification triggers.
 *
 * Centralizes the "who should get this?" logic so source modules don't
 * have to know about the users table, roles, or department assignments.
 *
 * All methods return `string[]` of user_id (uuid) values. Empty array
 * means nobody — the dispatcher short-circuits and does nothing.
 */
@Injectable()
export class RecipientsService {
  private readonly logger = new Logger(RecipientsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * All department heads for a given department.
   * A department may have 0 or 1 DH in practice, but we return an array
   * to be future-proof.
   */
  async departmentHeadsOf(deptId: string): Promise<string[]> {
    if (!deptId) return [];
    try {
      const { data, error } = await this.supabase
        .getAdminClient()
        .from('users')
        .select('user_id')
        .eq('role', 'department_head')
        .eq('dept_id', deptId)
        .eq('is_active', true);

      if (error) {
        this.logger.warn(
          `departmentHeadsOf(${deptId}) failed: ${error.message}`,
        );
        return [];
      }
      return (data ?? []).map((r) => String(r.user_id));
    } catch (err) {
      this.logger.warn(
        `departmentHeadsOf(${deptId}) threw: ${(err as Error).message}`,
      );
      return [];
    }
  }

  /**
   * The single college dean (there's a single-dean rule).
   */
  async collegeDean(): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .getAdminClient()
        .from('users')
        .select('user_id')
        .eq('role', 'college_dean')
        .eq('is_active', true);

      if (error) {
        this.logger.warn(`collegeDean() failed: ${error.message}`);
        return [];
      }
      return (data ?? []).map((r) => String(r.user_id));
    } catch (err) {
      this.logger.warn(`collegeDean() threw: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * All active administrators.
   */
  async administrators(): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .getAdminClient()
        .from('users')
        .select('user_id')
        .eq('role', 'administrator')
        .eq('is_active', true);

      if (error) {
        this.logger.warn(`administrators() failed: ${error.message}`);
        return [];
      }
      return (data ?? []).map((r) => String(r.user_id));
    } catch (err) {
      this.logger.warn(`administrators() threw: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * All active DHs across the college.
   */
  async allDepartmentHeads(): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .getAdminClient()
        .from('users')
        .select('user_id')
        .eq('role', 'department_head')
        .eq('is_active', true);

      if (error) {
        this.logger.warn(`allDepartmentHeads() failed: ${error.message}`);
        return [];
      }
      return (data ?? []).map((r) => String(r.user_id));
    } catch (err) {
      this.logger.warn(
        `allDepartmentHeads() threw: ${(err as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Resolve the DH(s) who own a given schedule entry.
   * Used by schedule-related triggers.
   */
  async departmentHeadsOfSchedule(scheduleId: string): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .getAdminClient()
        .from('schedule')
        .select('dept_id')
        .eq('schedule_id', scheduleId)
        .maybeSingle();

      if (error || !data?.dept_id) {
        this.logger.warn(
          `departmentHeadsOfSchedule(${scheduleId}) lookup failed: ${error?.message ?? 'no dept_id'}`,
        );
        return [];
      }
      return this.departmentHeadsOf(String(data.dept_id));
    } catch (err) {
      this.logger.warn(
        `departmentHeadsOfSchedule(${scheduleId}) threw: ${(err as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Resolve the DH who owns a given faculty member.
   * Used by faculty-related triggers.
   */
  async departmentHeadsOfFaculty(facultyId: string): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .getAdminClient()
        .from('faculty')
        .select('dept_id')
        .eq('faculty_id', facultyId)
        .maybeSingle();

      if (error || !data?.dept_id) {
        this.logger.warn(
          `departmentHeadsOfFaculty(${facultyId}) lookup failed: ${error?.message ?? 'no dept_id'}`,
        );
        return [];
      }
      return this.departmentHeadsOf(String(data.dept_id));
    } catch (err) {
      this.logger.warn(
        `departmentHeadsOfFaculty(${facultyId}) threw: ${(err as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Deduplicate a list of user IDs.
   */
  uniq(ids: Array<string | null | undefined>): string[] {
    return Array.from(new Set(ids.filter((id): id is string => !!id)));
  }
}