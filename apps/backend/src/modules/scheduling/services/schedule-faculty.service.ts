import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SupabaseService } from '../../../database/supabase.service';
import { NotificationDispatcherService } from '../../notifications/notification-dispatcher.service';
import { RecipientsService } from '../../notifications/recipients.service';
import { Schedule } from '../entities/schedule.entity';

/**
 * Ownership checks, workload notifications, and the cross-department
 * faculty-request gate used by plot/update/delete flows.
 */
@Injectable()
export class ScheduleFacultyService {
  private readonly logger = new Logger(ScheduleFacultyService.name);

  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    private readonly supabase: SupabaseService,
    private readonly dispatcher: NotificationDispatcherService,
    private readonly recipients: RecipientsService,
  ) {}

  async assertOwnership(scheduleId: string, user: any): Promise<Schedule> {
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    const found = await this.scheduleRepo.findOne({
      where: { scheduleId },
    });
    if (!found) throw new NotFoundException('Schedule entry not found');

    // `administrator` retained for the hidden dev account (recovery).
    // `college_dean` is the top user-facing role after consolidation.
    if (user.role === 'administrator' || user.role === 'college_dean') {
      return found;
    }

    if (user.role === 'department_head') {
      const userDeptId = user.deptId != null ? String(user.deptId) : null;
      if (!userDeptId || String(found.deptId) !== userDeptId) {
        throw new ForbiddenException(
          'You cannot edit schedules from other departments.',
        );
      }
      return found;
    }

    throw new ForbiddenException(
      'You do not have permission to modify schedules.',
    );
  }

  async checkFacultyOverload(
    facultyId: string,
    termId: string,
  ): Promise<void> {
    try {
      const totalHours = await this.computeFacultyWeeklyHours(
        facultyId,
        termId,
      );

      const { data: fac } = await this.supabase
        .getAdminClient()
        .from('faculty')
        .select('first_name, last_name, dept_id, required_hours')
        .eq('faculty_id', facultyId)
        .maybeSingle();

      if (!fac) return;

      const requiredHours = Number(fac.required_hours ?? 18);
      if (totalHours <= requiredHours) return;

      const ownerDHs = await this.recipients.departmentHeadsOf(
        String(fac.dept_id),
      );
      const dean = await this.recipients.collegeDean();

      await this.dispatcher.dispatch('faculty.overloaded', {
        recipientUserIds: this.recipients.uniq([...ownerDHs, ...dean]),
        title: 'Faculty workload exceeds cap',
        body:
          `${fac.first_name} ${fac.last_name} is assigned ${totalHours}h ` +
          `(cap: ${requiredHours}h).`,
        entityType: 'faculty',
        entityId: facultyId,
        payload: {
          facultyName: `${fac.first_name} ${fac.last_name}`,
          totalHours,
          requiredHours,
        },
      });
    } catch (err) {
      this.logger.warn(
        `checkFacultyOverload(${facultyId}) failed: ` +
          `${(err as Error).message}`,
      );
    }
  }

  /**
   * F1b: detect cross-department faculty and create/reuse a pending
   * faculty_request when a department head plots another department's
   * faculty member.
   */
  async ensureCrossDeptFacultyRequest(params: {
    facultyId: string | null | undefined;
    subjectDeptId: string | null;
    termId: string;
    subjectId: string;
    user: any;
  }): Promise<{ requestId: string; facultyDeptId: string } | null> {
    const { facultyId, subjectDeptId, termId, subjectId, user } = params;

    if (!facultyId) return null;

    if (
      user?.role === 'college_dean' ||
      user?.role === 'administrator'
    ) {
      return null;
    }

    if (!subjectDeptId) return null;

    const db = this.supabase.getAdminClient();

    const { data: fac } = await db
      .from('faculty')
      .select('faculty_id, dept_id')
      .eq('faculty_id', facultyId)
      .maybeSingle();

    if (!fac?.dept_id) return null;
    const facultyDeptId = String(fac.dept_id);

    if (facultyDeptId === String(subjectDeptId)) return null;

    // F1b (2B): one-shot approval semantics. Reuse a pending request while
    // the DH is mid-workflow, but never an already-consumed approved one.
    const { data: existing } = await db
      .from('faculty_request')
      .select('request_id, status')
      .eq('faculty_id', facultyId)
      .eq('subject_id', subjectId)
      .eq('term_id', termId)
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) {
      return {
        requestId: String(existing.request_id),
        facultyDeptId,
      };
    }

    const requestingDeptId = user?.deptId
      ? String(user.deptId)
      : subjectDeptId;

    const { data: created, error } = await db
      .from('faculty_request')
      .insert({
        faculty_id: facultyId,
        subject_id: subjectId,
        term_id: termId,
        requesting_dept_id: requestingDeptId,
        target_dept_id: facultyDeptId,
        reason:
          'Auto-created by cross-department faculty gate: ' +
          'a subject owned by another department was plotted with ' +
          'a faculty member from your department.',
        status: 'pending',
        created_by: user?.userId ?? null,
      })
      .select('request_id')
      .single();

    if (error || !created) {
      this.logger.warn(
        `F1b: failed to create faculty_request: ${error?.message}`,
      );
      return null;
    }

    this.logger.log(
      `F1b: created request ${created.request_id} ` +
        `(requesting=${requestingDeptId}, target=${facultyDeptId}, ` +
        `faculty=${facultyId}, subject=${subjectId}, term=${termId})`,
    );

    return {
      requestId: String(created.request_id),
      facultyDeptId,
    };
  }

  /** Cancel a pending/approved request once its last schedule row is gone. */
  async cancelOrphanedFacultyRequest(requestId: string): Promise<void> {
    try {
      const db = this.supabase.getAdminClient();

      const { data: remaining, error: countErr } = await db
        .from('schedule')
        .select('schedule_id')
        .eq('pending_faculty_request_id', requestId)
        .limit(1);

      if (countErr) {
        this.logger.warn(
          `F1b cleanup: failed to count remaining rows for request ` +
            `${requestId}: ${countErr.message}`,
        );
        return;
      }

      if (remaining && remaining.length > 0) return;

      const { data: req, error: reqErr } = await db
        .from('faculty_request')
        .select('request_id, status')
        .eq('request_id', requestId)
        .maybeSingle();

      if (reqErr || !req) {
        this.logger.warn(
          `F1b cleanup: request ${requestId} not found or lookup failed: ` +
            `${reqErr?.message}`,
        );
        return;
      }

      if (req.status !== 'pending' && req.status !== 'approved') {
        return;
      }

      const { error: updateErr } = await db
        .from('faculty_request')
        .update({
          status: 'cancelled',
          responded_at: new Date().toISOString(),
          response_remarks:
            'Auto-cancelled: the linked schedule entry was deleted.',
        })
        .eq('request_id', requestId);

      if (updateErr) {
        this.logger.warn(
          `F1b cleanup: failed to cancel request ${requestId}: ` +
            `${updateErr.message}`,
        );
        return;
      }

      this.logger.log(
        `F1b cleanup: cancelled orphaned request ${requestId} ` +
          '(schedule row deleted)',
      );

      try {
        const { data: fullReq } = await db
          .from('faculty_request')
          .select('target_dept_id')
          .eq('request_id', requestId)
          .maybeSingle();

        if (fullReq?.target_dept_id) {
          const targetDHs = await this.recipients.departmentHeadsOf(
            String(fullReq.target_dept_id),
          );
          await this.dispatcher.dispatch('request.cancelled', {
            recipientUserIds: targetDHs,
            title: 'Cross-dept request cancelled',
            body:
              'A cross-department faculty request was auto-cancelled ' +
              'because the linked class was deleted.',
            entityType: 'faculty_request',
            entityId: requestId,
            payload: {
              reason: 'schedule_deleted',
              requestId,
            },
          });
        }
      } catch (err) {
        this.logger.warn(
          `F1b cleanup: cancellation notification failed: ` +
            `${(err as Error).message}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `F1b cleanup: unexpected error for request ${requestId}: ` +
          `${(err as Error).message}`,
      );
    }
  }

  private async computeFacultyWeeklyHours(
    facultyId: string,
    termId: string,
  ): Promise<number> {
    const { data } = await this.supabase
      .getAdminClient()
      .from('schedule')
      .select('start_time, end_time')
      .eq('faculty_id', facultyId)
      .eq('term_id', termId);

    let totalMinutes = 0;
    for (const row of data ?? []) {
      if (!row.start_time || !row.end_time) continue;
      const start = this.timeToMinutes(row.start_time);
      const end = this.timeToMinutes(row.end_time);
      if (end > start) totalMinutes += end - start;
    }
    return Math.round((totalMinutes / 60) * 10) / 10;
  }

  private timeToMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }
}
