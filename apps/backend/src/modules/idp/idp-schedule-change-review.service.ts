import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Department } from '../departments/entities/department.entity';
import { Faculty } from '../faculty/entities/faculty.entity';
import { Schedule } from '../scheduling/entities/schedule.entity';
import { ScheduleUnfinalizeService } from '../scheduling/services/schedule-unfinalize.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { Subject } from '../subjects/entities/subject.entity';
import { Term } from '../terms/entities/term.entity';
import { IdpChangeRequest } from './entities/idp-change-request.entity';
import { IdpChangeRequestService } from './idp-change-request.service';
import type { IdpChangeRequestStatus } from './idp.types';

const SCHEDULE_CHANGE_TYPES = ['schedule_override', 'unavailability_change'];

type ReviewProfile = {
  role?: string;
  deptId?: string | number | null;
  userId?: string | null;
  user_id?: string | null;
};

type ConflictState = 'ok' | 'warning' | 'conflict' | 'unknown';

type ConflictItem = {
  severity: 'hard' | 'soft' | 'info';
  ruleId: string;
  ruleName: string;
  reason: string;
};

type Lookups = {
  faculties: Map<string, Faculty>;
  departments: Map<string, Department>;
  subjectsByCode: Map<string, Subject>;
  termsById: Map<string, Term>;
  termsByCode: Map<string, Term>;
  schedules: Map<string, Schedule>;
  activeTerm: Term | null;
};

type ScheduleChangeView = {
  idpRequestId: string;
  type: string;
  status: IdpChangeRequestStatus;
  severity: string;
  requiresAck: boolean;
  requestedAt: string;
  receivedAt: string;
  faculty: {
    facultyId: string;
    name: string;
    deptId: string | null;
    deptCode: string | null;
    deptName: string | null;
  } | null;
  subject: {
    subjectId: string;
    subjectCode: string;
    title: string;
    deptId: string | null;
  } | null;
  term: {
    termId: string;
    label: string;
    schoolYear: string;
    semester: string | null;
    isActive: boolean;
  } | null;
  schedule: {
    scheduleId: string;
    subjectCode: string | null;
    subjectTitle: string | null;
    section: string | null;
    facultyName: string | null;
    room: string | null;
    dayOfWeek: string | null;
    startTime: string | null;
    endTime: string | null;
    status: string;
  } | null;
  proposed: {
    dayOfWeek: string | null;
    startTime: string | null;
    endTime: string | null;
    loadType: string | null;
    sectionCode: string | null;
    roomId: string | null;
    reason: string | null;
    affectedDates: string[];
  };
  conflict: {
    state: ConflictState;
    summary: string;
    items: ConflictItem[];
  };
  ack: {
    action: string;
    notes: string | null;
    acknowledgedBy: string | null;
    acknowledgedAt: string;
  } | null;
  canReview: boolean;
  requiresDeanUnfinalize: boolean;
  details: Record<string, unknown>;
};

@Injectable()
export class IdpScheduleChangeReviewService {
  private readonly logger = new Logger(IdpScheduleChangeReviewService.name);

  constructor(
    @InjectRepository(IdpChangeRequest)
    private readonly changeRepo: Repository<IdpChangeRequest>,
    @InjectRepository(Faculty)
    private readonly facultyRepo: Repository<Faculty>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
    @InjectRepository(Term)
    private readonly termRepo: Repository<Term>,
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    private readonly changeRequests: IdpChangeRequestService,
    private readonly scheduling: SchedulingService,
    private readonly unfinalize: ScheduleUnfinalizeService,
  ) {}

  async list(
    profile: ReviewProfile,
    query: { status?: string; limit?: number } = {},
  ): Promise<{
    items: ScheduleChangeView[];
    counts: {
      pending: number;
      ready: number;
      conflicted: number;
      warning: number;
      unknown: number;
    };
  }> {
    const status = this.parseStatus(query.status);
    const rows = await this.changeRepo.find({
      where: {
        type: In(SCHEDULE_CHANGE_TYPES),
        ...(status ? { status } : {}),
      },
      order: { requestedAt: 'DESC' },
      take: Math.min(Math.max(Number(query.limit) || 200, 1), 500),
    });

    const lookups = await this.loadLookups(rows);
    const views: ScheduleChangeView[] = [];
    for (const row of rows) {
      const view = await this.buildView(
        row,
        lookups,
        profile,
        row.status === 'pending',
      );
      if (view) views.push(view);
    }

    return {
      items: views,
      counts: {
        pending: views.filter((v) => v.status === 'pending').length,
        ready: views.filter(
          (v) => v.status === 'pending' && v.conflict.state === 'ok',
        ).length,
        conflicted: views.filter(
          (v) => v.status === 'pending' && v.conflict.state === 'conflict',
        ).length,
        warning: views.filter(
          (v) => v.status === 'pending' && v.conflict.state === 'warning',
        ).length,
        unknown: views.filter(
          (v) => v.status === 'pending' && v.conflict.state === 'unknown',
        ).length,
      },
    };
  }

  async decide(
    idpRequestId: string,
    dto: {
      action: 'accepted' | 'rejected';
      notes?: string | null;
      acknowledgeConflicts?: boolean;
    },
    profile: ReviewProfile,
  ): Promise<{
    request: ScheduleChangeView;
    ack: Awaited<ReturnType<IdpChangeRequestService['acknowledge']>>;
    unfinalize: { filed: boolean; requestId?: string; message?: string };
  }> {
    const row = await this.changeRepo.findOne({ where: { idpRequestId } });
    if (!row) {
      throw new NotFoundException(
        `Change request '${idpRequestId}' was not found.`,
      );
    }
    if (!SCHEDULE_CHANGE_TYPES.includes(row.type)) {
      throw new BadRequestException(
        'This review page only handles schedule and unavailability changes.',
      );
    }

    const lookups = await this.loadLookups([row]);
    const before = await this.buildView(row, lookups, profile, true);
    if (!before) {
      throw new ForbiddenException('This request is outside your department.');
    }

    if (
      dto.action === 'accepted' &&
      before.conflict.state === 'conflict' &&
      dto.acknowledgeConflicts !== true
    ) {
      throw new BadRequestException(
        'This request has blocking conflicts. Review them and confirm before approving.',
      );
    }

    const userId = profile?.userId ?? profile?.user_id;
    if (!userId) throw new ForbiddenException('Not authenticated.');

    const notes =
      this.text(dto.notes) ??
      (dto.action === 'accepted'
        ? 'Approved in the CoE-NNECT schedule-change review.'
        : 'Rejected in the CoE-NNECT schedule-change review.');

    const ack = await this.changeRequests.acknowledge(
      idpRequestId,
      { action: dto.action, notes },
      String(userId),
    );

    let unfinalize: { filed: boolean; requestId?: string; message?: string } = {
      filed: false,
    };

    if (
      dto.action === 'accepted' &&
      row.type === 'schedule_override' &&
      before.schedule?.status === 'published' &&
      profile?.role === 'department_head'
    ) {
      try {
        const filed = await this.unfinalize.create(
          before.schedule.scheduleId,
          {
            reason:
              `IDP schedule change ${idpRequestId} was approved. ` +
              'Dean approval is needed to unfinalize this published block before the change can be applied.',
          },
          profile,
        );
        unfinalize = { filed: true, requestId: String(filed.requestId) };
      } catch (err) {
        const message = (err as Error).message;
        this.logger.warn(
          `Could not auto-file unfinalize request for ${idpRequestId}: ${message}`,
        );
        unfinalize = { filed: false, message };
      }
    }

    const refreshed = await this.changeRepo.findOne({
      where: { idpRequestId },
    });
    const after = refreshed
      ? await this.buildView(refreshed, lookups, profile, false)
      : null;

    return {
      request: after ?? before,
      ack,
      unfinalize,
    };
  }

  private parseStatus(value?: string): IdpChangeRequestStatus | undefined {
    if (!value) return undefined;
    if (!['pending', 'acknowledged', 'rejected'].includes(value)) {
      throw new BadRequestException('Unknown change-request status.');
    }
    return value as IdpChangeRequestStatus;
  }

  private async loadLookups(rows: IdpChangeRequest[]): Promise<Lookups> {
    const facultyIds = this.unique(
      rows.map((row) => (row.facultyId != null ? String(row.facultyId) : '')),
    );
    const scheduleIds = this.unique(
      rows.map((row) => this.text(row.payload?.details?.coe_nnect_schedule_id)),
    );
    const subjectCodes = this.unique(
      rows.map((row) => this.text(row.payload?.details?.subject_code)),
    );
    const termCodes = this.unique(
      rows.map((row) => this.text(row.payload?.details?.term_code)),
    );

    const [faculties, departments, subjects, terms, schedules, activeTerm] =
      await Promise.all([
        facultyIds.length
          ? this.facultyRepo.find({ where: { facultyId: In(facultyIds) } })
          : Promise.resolve([] as Faculty[]),
        this.departmentRepo.find(),
        subjectCodes.length
          ? this.subjectRepo.find({
              where: { subjectCode: In(subjectCodes) },
            })
          : Promise.resolve([] as Subject[]),
        this.termRepo.find(),
        scheduleIds.length
          ? this.scheduleRepo.find({
              where: { scheduleId: In(scheduleIds) },
              relations: ['subject', 'faculty', 'room'],
            })
          : Promise.resolve([] as Schedule[]),
        this.termRepo.findOne({ where: { isActive: true } }),
      ]);

    const termsByCode = new Map<string, Term>();
    for (const term of terms) {
      termsByCode.set(`${term.schoolYear}-${term.semester}`, term);
    }

    return {
      faculties: new Map(faculties.map((f) => [String(f.facultyId), f])),
      departments: new Map(
        departments.map((d) => [String(d.deptId), d] as const),
      ),
      subjectsByCode: new Map(subjects.map((s) => [s.subjectCode, s])),
      termsById: new Map(terms.map((t) => [String(t.termId), t])),
      termsByCode,
      schedules: new Map(
        schedules.map((s) => [String(s.scheduleId), s] as const),
      ),
      activeTerm,
    };
  }

  private async buildView(
    row: IdpChangeRequest,
    lookups: Lookups,
    profile: ReviewProfile,
    analyze: boolean,
  ): Promise<ScheduleChangeView | null> {
    const details = (row.payload?.details ?? {}) as Record<string, unknown>;
    const faculty = row.facultyId
      ? (lookups.faculties.get(String(row.facultyId)) ?? null)
      : null;
    const scheduleId = this.text(details.coe_nnect_schedule_id);
    const schedule = scheduleId
      ? (lookups.schedules.get(scheduleId) ?? null)
      : null;
    const subjectCode =
      this.text(details.subject_code) ?? schedule?.subject?.subjectCode ?? null;
    const subject = subjectCode
      ? (lookups.subjectsByCode.get(subjectCode) ?? schedule?.subject ?? null)
      : (schedule?.subject ?? null);
    const term =
      this.resolveTerm(this.text(details.term_code), lookups) ??
      (schedule?.termId
        ? (lookups.termsById.get(String(schedule.termId)) ?? null)
        : null);

    if (!this.isVisible(row, faculty, details, lookups, profile)) return null;

    const facultyDept = faculty?.deptId
      ? (lookups.departments.get(String(faculty.deptId)) ?? null)
      : null;

    const proposed = {
      dayOfWeek:
        this.normalizeDay(
          this.text(details.day_of_week) ?? this.text(details.day),
        ) ??
        schedule?.dayOfWeek ??
        null,
      startTime:
        this.normalizeTime(
          this.text(details.start_time) ?? this.text(details.startTime),
        ) ??
        schedule?.startTime ??
        null,
      endTime:
        this.normalizeTime(
          this.text(details.end_time) ?? this.text(details.endTime),
        ) ??
        schedule?.endTime ??
        null,
      loadType:
        this.normalizeLoadType(this.text(details.load_type)) ??
        schedule?.loadType ??
        null,
      sectionCode: this.text(details.section_code) ?? schedule?.section ?? null,
      roomId: this.text(details.room_id) ?? schedule?.roomId ?? null,
      reason: this.text(details.reason),
      affectedDates: Array.isArray(row.affectedDates) ? row.affectedDates : [],
    };

    const conflict = analyze
      ? await this.analyze(row, details, {
          faculty,
          subject,
          schedule,
          term: term ?? lookups.activeTerm,
          proposed,
        })
      : {
          state: 'ok' as const,
          summary:
            row.status === 'pending'
              ? 'Conflict check has not run yet.'
              : 'Reviewed. The decision is recorded below.',
          items: [] as ConflictItem[],
        };

    return {
      idpRequestId: row.idpRequestId,
      type: row.type,
      status: row.status,
      severity: row.severity,
      requiresAck: row.requiresAck,
      requestedAt: new Date(row.requestedAt).toISOString(),
      receivedAt: new Date(row.receivedAt).toISOString(),
      faculty: faculty
        ? {
            facultyId: String(faculty.facultyId),
            name: `${faculty.firstName} ${faculty.lastName}`.trim(),
            deptId: faculty.deptId != null ? String(faculty.deptId) : null,
            deptCode: facultyDept?.deptCode ?? null,
            deptName: facultyDept?.deptName ?? null,
          }
        : null,
      subject: subject
        ? {
            subjectId: String(subject.subjectId),
            subjectCode: subject.subjectCode,
            title: subject.title,
            deptId: subject.deptId != null ? String(subject.deptId) : null,
          }
        : null,
      term: term
        ? {
            termId: String(term.termId),
            label: `${term.schoolYear} · ${term.semester ?? 'term'}`,
            schoolYear: term.schoolYear,
            semester: term.semester,
            isActive: term.isActive,
          }
        : null,
      schedule: schedule
        ? {
            scheduleId: String(schedule.scheduleId),
            subjectCode: schedule.subject?.subjectCode ?? null,
            subjectTitle: schedule.subject?.title ?? null,
            section: schedule.section,
            facultyName: schedule.faculty
              ? `${schedule.faculty.firstName} ${schedule.faculty.lastName}`.trim()
              : schedule.externalFacultyName,
            room:
              schedule.room?.roomNumber ?? schedule.externalRoomName ?? null,
            dayOfWeek: schedule.dayOfWeek,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            status: schedule.status,
          }
        : null,
      proposed,
      conflict,
      ack: row.acknowledgedAt
        ? {
            action: row.ackAction ?? 'accepted',
            notes: row.ackNotes,
            acknowledgedBy: row.acknowledgedBy,
            acknowledgedAt: new Date(row.acknowledgedAt).toISOString(),
          }
        : null,
      canReview: row.status === 'pending',
      requiresDeanUnfinalize:
        row.type === 'schedule_override' && schedule?.status === 'published',
      details,
    };
  }

  private async analyze(
    row: IdpChangeRequest,
    details: Record<string, unknown>,
    input: {
      faculty: Faculty | null;
      subject: Subject | null;
      schedule: Schedule | null;
      term: Term | null;
      proposed: ScheduleChangeView['proposed'];
    },
  ): Promise<ScheduleChangeView['conflict']> {
    if (row.type === 'unavailability_change') {
      return this.analyzeUnavailability(input);
    }
    return this.analyzeScheduleOverride(row.idpRequestId, details, input);
  }

  private async analyzeScheduleOverride(
    requestId: string,
    details: Record<string, unknown>,
    input: {
      faculty: Faculty | null;
      subject: Subject | null;
      schedule: Schedule | null;
      term: Term | null;
      proposed: ScheduleChangeView['proposed'];
    },
  ): Promise<ScheduleChangeView['conflict']> {
    const { faculty, subject, schedule, term, proposed } = input;

    if (!term?.termId) {
      return {
        state: 'unknown',
        summary: 'No term could be resolved for this request.',
        items: [],
      };
    }
    if (!subject?.subjectId) {
      return {
        state: 'unknown',
        summary: 'No subject could be resolved for this request.',
        items: [],
      };
    }
    if (!proposed.dayOfWeek || !proposed.startTime || !proposed.endTime) {
      return {
        state: 'unknown',
        summary:
          'This request does not include a day and time window, so conflicts cannot be checked.',
        items: [],
      };
    }

    const items: ConflictItem[] = [];
    const excludeId =
      this.text(details.coe_nnect_schedule_id) ?? schedule?.scheduleId;

    return this.scheduling
      .validate({
        termId: String(term.termId),
        subjectId: String(subject.subjectId),
        facultyId: faculty?.facultyId
          ? String(faculty.facultyId)
          : (schedule?.facultyId ?? undefined),
        roomId: schedule?.roomId ?? undefined,
        section: proposed.sectionCode ?? undefined,
        loadType: (proposed.loadType ?? 'lecture') as
          'lecture' | 'laboratory' | 'other',
        dayOfWeek: proposed.dayOfWeek,
        startTime: proposed.startTime,
        endTime: proposed.endTime,
        excludeId: excludeId ? String(excludeId) : undefined,
      })
      .then((result) => {
        for (const conflict of result.hardConflicts) {
          items.push({
            severity: 'hard',
            ruleId: conflict.ruleId,
            ruleName: conflict.ruleName,
            reason: conflict.reason,
          });
        }
        for (const warning of result.softWarnings) {
          items.push({
            severity: 'soft',
            ruleId: warning.ruleId,
            ruleName: warning.ruleName,
            reason: warning.reason,
          });
        }
        if (schedule?.status === 'published') {
          items.push({
            severity: 'info',
            ruleId: 'PUBLISHED-BLOCK',
            ruleName: 'Published block',
            reason:
              'Approving this request will also file a Dean unfinalize request before the block can be edited.',
          });
        }
        return this.summarize(items);
      })
      .catch((err: Error) => {
        this.logger.warn(
          `Conflict check failed for ${requestId}: ${err.message}`,
        );
        return {
          state: 'unknown' as const,
          summary: `Conflict check could not run: ${err.message}`,
          items: [],
        };
      });
  }

  private async analyzeUnavailability(input: {
    faculty: Faculty | null;
    subject: Subject | null;
    schedule: Schedule | null;
    term: Term | null;
    proposed: ScheduleChangeView['proposed'];
  }): Promise<ScheduleChangeView['conflict']> {
    const { faculty, term, proposed } = input;

    if (!faculty?.facultyId) {
      return {
        state: 'unknown',
        summary: 'No faculty member could be resolved for this request.',
        items: [],
      };
    }
    if (!term?.termId) {
      return {
        state: 'unknown',
        summary: 'No term could be resolved for this request.',
        items: [],
      };
    }
    if (!proposed.dayOfWeek || !proposed.startTime || !proposed.endTime) {
      return {
        state: 'unknown',
        summary:
          'This request does not include a day and time window, so conflicts cannot be checked.',
        items: [],
      };
    }

    const start = this.minutes(proposed.startTime);
    const end = this.minutes(proposed.endTime);
    if (start == null || end == null || end <= start) {
      return {
        state: 'unknown',
        summary: 'The requested time window is invalid.',
        items: [],
      };
    }

    return this.scheduleRepo
      .find({
        where: {
          termId: String(term.termId),
          facultyId: String(faculty.facultyId),
          dayOfWeek: proposed.dayOfWeek as Schedule['dayOfWeek'],
        },
        relations: ['subject'],
      })
      .then((rows) => {
        const overlaps = rows.filter((row) => {
          const rowStart = this.minutes(row.startTime);
          const rowEnd = this.minutes(row.endTime);
          if (rowStart == null || rowEnd == null) return false;
          return rowStart < end && rowEnd > start;
        });

        const items: ConflictItem[] = overlaps.map((row) => ({
          severity: 'hard',
          ruleId: 'UNAVAIL-OVERLAP',
          ruleName: 'Existing class',
          reason:
            `${row.subject?.subjectCode ?? 'Class'}${row.section ? ` (${row.section})` : ''} ` +
            `is already plotted ${this.displayTime(row.startTime)}–${this.displayTime(row.endTime)}.`,
        }));

        if (items.length === 0) {
          return {
            state: 'ok' as const,
            summary: 'No plotted class overlaps this unavailability window.',
            items,
          };
        }
        return this.summarize(items);
      })
      .catch((err: Error) => {
        this.logger.warn(
          `Unavailability conflict check failed: ${err.message}`,
        );
        return {
          state: 'unknown' as const,
          summary: `Conflict check could not run: ${err.message}`,
          items: [],
        };
      });
  }

  private summarize(items: ConflictItem[]): ScheduleChangeView['conflict'] {
    const hard = items.filter((item) => item.severity === 'hard').length;
    const soft = items.filter((item) => item.severity === 'soft').length;
    if (hard > 0) {
      return {
        state: 'conflict',
        summary: `${hard} blocking conflict${hard === 1 ? '' : 's'} found.`,
        items,
      };
    }
    if (soft > 0) {
      return {
        state: 'warning',
        summary: `${soft} advisory warning${soft === 1 ? '' : 's'} found.`,
        items,
      };
    }
    return {
      state: 'ok',
      summary: 'No conflicts found for the proposed change.',
      items,
    };
  }

  private isVisible(
    row: IdpChangeRequest,
    faculty: Faculty | null,
    details: Record<string, unknown>,
    lookups: Lookups,
    profile: ReviewProfile,
  ): boolean {
    if (profile?.role !== 'department_head') return true;
    if (profile.deptId == null) return false;

    const deptId = String(profile.deptId);
    if (faculty?.deptId != null && String(faculty.deptId) === deptId) {
      return true;
    }

    const profileDept = lookups.departments.get(deptId);
    const detailCode =
      this.text(details.department_code) ??
      this.text(details.from_department_code) ??
      this.text(details.to_department_code);
    if (profileDept && detailCode && detailCode === profileDept.deptCode) {
      return true;
    }

    // A request with no resolved faculty is only visible when its details
    // explicitly name the DH's department.
    return false;
  }

  private resolveTerm(code: string | null, lookups: Lookups): Term | null {
    if (!code) return null;
    if (lookups.termsById.has(code)) {
      return lookups.termsById.get(code) ?? null;
    }
    return lookups.termsByCode.get(code) ?? null;
  }

  private normalizeDay(value: string | null): string | null {
    if (!value) return null;
    const full: Record<string, string> = {
      mon: 'Monday',
      tue: 'Tuesday',
      tues: 'Tuesday',
      wed: 'Wednesday',
      thu: 'Thursday',
      thur: 'Thursday',
      thurs: 'Thursday',
      fri: 'Friday',
      sat: 'Saturday',
      sun: 'Sunday',
    };
    const key = value.trim().toLowerCase();
    if (key.length <= 4 && full[key]) return full[key];
    const titled = key.charAt(0).toUpperCase() + key.slice(1);
    return [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ].includes(titled)
      ? titled
      : null;
  }

  private normalizeTime(value: string | null): string | null {
    if (!value) return null;
    const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
    if (!match) return null;
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }

  private normalizeLoadType(value: string | null): string | null {
    if (!value) return null;
    if (value === 'lab') return 'laboratory';
    if (['lecture', 'laboratory', 'other'].includes(value)) return value;
    return null;
  }

  private minutes(value: string | null): number | null {
    if (!value) return null;
    const [hours, mins] = value.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
    return hours * 60 + mins;
  }

  private displayTime(value: string | null): string {
    const mins = this.minutes(value);
    if (mins == null) return '—';
    const hours = Math.floor(mins / 60);
    const remainder = mins % 60;
    return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }

  private unique(values: Array<string | null | undefined>): string[] {
    return Array.from(
      new Set(values.filter((value): value is string => !!value)),
    );
  }

  private text(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
  }
}
