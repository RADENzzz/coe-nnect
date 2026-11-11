import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { Department } from '../departments/entities/department.entity';
import { Faculty } from '../faculty/entities/faculty.entity';
import { Room } from '../rooms/entities/room.entity';
import { Schedule } from '../scheduling/entities/schedule.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { Designation } from '../system-config/entities/designation.entity';
import { Term } from '../terms/entities/term.entity';

const DAY_ORDER: Record<string, number> = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7,
};

export interface PublicOverview {
  publishedEntries: number;
  publishedTerms: number;
  activeDepartments: number;
  activeFaculty: number;
  idpLinkedFaculty: number;
  activeSubjects: number;
  activeRooms: number;
}

export interface PublicTerm {
  termId: string;
  termName: string;
  schoolYear: string;
  semester: string | null;
  termCode: string | null;
  publishedCount: number;
}

export interface PublicScheduleEntry {
  scheduleId: string;
  departmentCode: string | null;
  subjectCode: string | null;
  subjectTitle: string | null;
  sectionCode: string | null;
  facultyName: string | null;
  externalFacultyName: string | null;
  roomNumber: string | null;
  externalRoomName: string | null;
  building: string | null;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  loadType: string | null;
}

export interface PublicSchedules {
  terms: PublicTerm[];
  term: PublicTerm | null;
  entries: PublicScheduleEntry[];
  generatedAt: string;
}

export interface PublicFacultyMember {
  facultyId: string;
  fullName: string;
  departmentCode: string | null;
  departmentName: string | null;
  designation: string | null;
  idpLinked: boolean;
}

export interface PublicFacultyDepartment {
  departmentCode: string;
  departmentName: string;
  facultyCount: number;
  idpCount: number;
}

export interface PublicFaculty {
  total: number;
  idpLinked: number;
  departments: PublicFacultyDepartment[];
  faculty: PublicFacultyMember[];
}

export type IntegrationState =
  | 'live'
  | 'configured_disabled'
  | 'incomplete'
  | 'not_configured';

export type MilestoneStatus = 'done' | 'in_progress' | 'planned';

export interface PublicIntegrationMilestone {
  key: string;
  title: string;
  status: MilestoneStatus;
  summary: string;
}

export interface PublicIntegrationStatus {
  service: string;
  generatedAt: string;
  state: IntegrationState;
  connection: {
    enabled: boolean;
    baseUrlConfigured: boolean;
    apiKeyConfigured: boolean;
    webhookSecretConfigured: boolean;
  };
  faculty: {
    total: number;
    linked: number;
    pending: number;
    failed: number;
    lastSyncedAt: string | null;
  };
  published: {
    terms: number;
    entries: number;
    latestTermCode: string | null;
  };
  milestones: PublicIntegrationMilestone[];
}

/**
 * Integration state as this build actually ships it. Kept in the backend so
 * the public status page cannot drift from the code without a deploy.
 */
const MILESTONES: PublicIntegrationMilestone[] = [
  {
    key: 'm1',
    title: 'Faculty roster and records',
    status: 'done',
    summary:
      'Signed webhook, roster pull with incremental cursor, qualifications, and unavailability.',
  },
  {
    key: 'm2',
    title: 'Published schedule push',
    status: 'done',
    summary:
      'Term preview, push to the published-schedules endpoint, bounded retry, replay-safe version id.',
  },
  {
    key: 'm3',
    title: 'Change requests and durable outbox',
    status: 'in_progress',
    summary:
      'Change-request webhook and ack, faculty-request status push, durable outbox replacing the in-memory dedupe map.',
  },
  {
    key: 'm4',
    title: 'Operations and hardening',
    status: 'planned',
    summary:
      'Secret rotation in the settings UI, load test, failure injection, final documentation pass.',
  },
];


/**
 * Read-only data for the public landing page.
 *
 * This service deliberately exposes only:
 * - published schedule rows (never drafts, review rows, flagged rows, or
 *   rows waiting on a cross-department faculty request),
 * - aggregate counts,
 * - a minimal faculty directory (name, department, designation,
 *   IDP-linked flag derived from `faculty.last_synced_at`).
 *
 * It never returns contact details, employee/WMSU IDs, credentials, webhook
 * secrets, or internal integration URLs.
 */
@Injectable()
export class PublicService {
  constructor(
    @InjectRepository(Schedule)
    private readonly schedules: Repository<Schedule>,
    @InjectRepository(Faculty)
    private readonly faculty: Repository<Faculty>,
    @InjectRepository(Department)
    private readonly departments: Repository<Department>,
    @InjectRepository(Subject)
    private readonly subjects: Repository<Subject>,
    @InjectRepository(Room)
    private readonly rooms: Repository<Room>,
    @InjectRepository(Term)
    private readonly terms: Repository<Term>,
    @InjectRepository(Designation)
    private readonly designations: Repository<Designation>,
    private readonly config: ConfigService,
  ) {}

  async getOverview(): Promise<PublicOverview> {
    const [published, departments, faculty, subjects, rooms] = await Promise.all([
      this.findPublishedSchedules(),
      this.departments.find(),
      this.faculty.find({ where: { isActive: true } }),
      this.subjects.find({ where: { isActive: true } }),
      this.rooms.find({ where: { isActive: true } }),
    ]);

    const activeDeptIds = new Set(
      departments
        .filter((department) => department.isActive)
        .map((department) => String(department.deptId)),
    );
    const visiblePublished = published.filter((row) =>
      this.isUsablePublishedRow(row, activeDeptIds),
    );
    const visibleFaculty = faculty.filter(
      (row) => row.deptId != null && activeDeptIds.has(String(row.deptId)),
    );

    return {
      publishedEntries: visiblePublished.length,
      publishedTerms: new Set(
        visiblePublished.map((row) => String(row.termId)),
      ).size,
      activeDepartments: activeDeptIds.size,
      activeFaculty: visibleFaculty.length,
      idpLinkedFaculty: visibleFaculty.filter((row) => this.isIdpLinked(row))
        .length,
      activeSubjects: subjects.length,
      activeRooms: rooms.length,
    };
  }

  async getSchedules(termId?: string): Promise<PublicSchedules> {
    const [published, terms, departments] = await Promise.all([
      this.findPublishedSchedules(),
      this.terms.find(),
      this.departments.find(),
    ]);

    const activeDeptMap = new Map(
      departments
        .filter((department) => department.isActive)
        .map((department) => [String(department.deptId), department]),
    );

    const usable = published.filter((row) =>
      this.isUsablePublishedRow(
        row,
        new Set(activeDeptMap.keys()),
      ),
    );

    const countByTerm = new Map<string, number>();
    for (const row of usable) {
      const key = String(row.termId);
      countByTerm.set(key, (countByTerm.get(key) ?? 0) + 1);
    }

    const termOptions: PublicTerm[] = terms
      .filter((term) => countByTerm.has(String(term.termId)))
      .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))
      .map((term) => ({
        termId: String(term.termId),
        termName: term.termName,
        schoolYear: term.schoolYear,
        semester: term.semester ?? null,
        termCode: this.termCode(term),
        publishedCount: countByTerm.get(String(term.termId)) ?? 0,
      }));

    const selected =
      termOptions.find((term) => term.termId === String(termId)) ??
      termOptions[0] ??
      null;

    const entries = selected
      ? usable
          .filter((row) => String(row.termId) === selected.termId)
          .sort((a, b) => this.compareRows(a, b))
          .map((row) => this.toPublicEntry(row, activeDeptMap))
      : [];

    return {
      terms: termOptions,
      term: selected,
      entries,
      generatedAt: new Date().toISOString(),
    };
  }

  async getFaculty(options: {
    departmentCode?: string;
    idpOnly?: boolean;
  } = {}): Promise<PublicFaculty> {
    const [faculty, departments, designations] = await Promise.all([
      this.faculty.find({
        where: { isActive: true },
        order: { lastName: 'ASC', firstName: 'ASC' },
      }),
      this.departments.find(),
      this.designations.find(),
    ]);

    const activeDeptMap = new Map(
      departments
        .filter((department) => department.isActive)
        .map((department) => [String(department.deptId), department]),
    );
    const designationMap = new Map(
      designations.map((designation) => [
        String(designation.designationId),
        designation.designationName,
      ]),
    );

    const all = faculty
      .filter((row) => row.deptId != null && activeDeptMap.has(String(row.deptId)))
      .map((row) => {
        const department = activeDeptMap.get(String(row.deptId));
        return {
          facultyId: String(row.facultyId),
          fullName: `${row.firstName} ${row.lastName}`.trim(),
          departmentCode: department?.deptCode ?? null,
          departmentName: department?.deptName ?? null,
          designation: row.designationId
            ? (designationMap.get(String(row.designationId)) ?? null)
            : null,
          idpLinked: this.isIdpLinked(row),
        } satisfies PublicFacultyMember;
      });

    const visible = all.filter((row) => {
      if (
        options.departmentCode &&
        row.departmentCode !== options.departmentCode
      ) {
        return false;
      }
      if (options.idpOnly && !row.idpLinked) return false;
      return true;
    });

    return {
      total: all.length,
      idpLinked: all.filter((row) => row.idpLinked).length,
      departments: Array.from(activeDeptMap.values())
        .map((department) => {
          const members = all.filter(
            (row) => row.departmentCode === department.deptCode,
          );
          return {
            departmentCode: department.deptCode,
            departmentName: department.deptName,
            facultyCount: members.length,
            idpCount: members.filter((row) => row.idpLinked).length,
          };
        })
        .filter((department) => department.facultyCount > 0)
        .sort((a, b) =>
          a.departmentCode.localeCompare(b.departmentCode),
        ),
      faculty: visible,
    };
  }

  /**
   * Integration status for the IDP team's view on the public landing page.
   *
   * Shape only, never values: the three credential booleans say whether
   * something is configured, and no base URL, key, secret, or internal
   * endpoint is ever returned. Counts come from live rows, so the page can
   * never claim progress the database does not have.
   */
  async getIntegrationStatus(): Promise<PublicIntegrationStatus> {
    const [published, departments, faculty, terms] = await Promise.all([
      this.findPublishedSchedules(),
      this.departments.find(),
      this.faculty.find({ where: { isActive: true } }),
      this.terms.find(),
    ]);

    const activeDeptIds = new Set(
      departments
        .filter((department) => department.isActive)
        .map((department) => String(department.deptId)),
    );
    const visibleFaculty = faculty.filter(
      (row) => row.deptId != null && activeDeptIds.has(String(row.deptId)),
    );
    const visiblePublished = published.filter((row) =>
      this.isUsablePublishedRow(row, activeDeptIds),
    );

    const linked = visibleFaculty.filter((row) => this.isIdpLinked(row));
    const lastSyncedAt = linked.reduce<Date | null>((latest, row) => {
      if (!row.lastSyncedAt) return latest;
      if (!latest || row.lastSyncedAt > latest) return row.lastSyncedAt;
      return latest;
    }, null);

    const countByTerm = new Map<string, number>();
    for (const row of visiblePublished) {
      const key = String(row.termId);
      countByTerm.set(key, (countByTerm.get(key) ?? 0) + 1);
    }
    const latestTerm = terms
      .filter((term) => countByTerm.has(String(term.termId)))
      .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0];

    const enabled =
      String(this.config.get<string>('IDP_ENABLED') ?? '').toLowerCase() ===
      'true';
    const baseUrlConfigured = hasValue(this.config.get<string>('IDP_BASE_URL'));
    const apiKeyConfigured = hasValue(
      this.config.get<string>('IDP_API_KEY'),
    );
    const webhookSecretConfigured = hasValue(
      this.config.get<string>('IDP_WEBHOOK_SECRET'),
    );

    return {
      service: 'coe-nnect-idp-integration',
      generatedAt: new Date().toISOString(),
      state: integrationState(
        enabled,
        baseUrlConfigured,
        apiKeyConfigured,
      ),
      connection: {
        enabled,
        baseUrlConfigured,
        apiKeyConfigured,
        webhookSecretConfigured,
      },
      faculty: {
        total: visibleFaculty.length,
        linked: linked.length,
        pending: visibleFaculty.filter((row) => row.syncStatus === 'pending')
          .length,
        failed: visibleFaculty.filter((row) => row.syncStatus === 'failed')
          .length,
        lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : null,
      },
      published: {
        terms: countByTerm.size,
        entries: visiblePublished.length,
        latestTermCode: latestTerm ? this.termCode(latestTerm) : null,
      },
      milestones: MILESTONES.map((milestone) => ({ ...milestone })),
    };
  }

  private findPublishedSchedules(): Promise<Schedule[]> {    return this.schedules.find({
      where: {
        status: 'published',
        flagged: false,
        pendingFacultyRequestId: IsNull(),
      },
      relations: ['subject', 'faculty', 'room', 'sectionRef'],
      order: { scheduleId: 'ASC' },
    });
  }

  private isUsablePublishedRow(
    row: Schedule,
    activeDeptIds: Set<string>,
  ): boolean {
    return Boolean(
      row.deptId != null &&
        activeDeptIds.has(String(row.deptId)) &&
        row.dayOfWeek &&
        row.startTime &&
        row.endTime,
    );
  }

  private toPublicEntry(
    row: Schedule,
    departments: Map<string, Department>,
  ): PublicScheduleEntry {
    const department = row.deptId
      ? departments.get(String(row.deptId))
      : undefined;
    const facultyName = row.faculty
      ? `${row.faculty.firstName} ${row.faculty.lastName}`.trim()
      : null;

    return {
      scheduleId: String(row.scheduleId),
      departmentCode: department?.deptCode ?? null,
      subjectCode: row.subject?.subjectCode ?? null,
      subjectTitle: row.subject?.title ?? null,
      sectionCode: row.section ?? row.sectionRef?.sectionCode ?? null,
      facultyName,
      externalFacultyName: row.externalFacultyName ?? null,
      roomNumber: row.room?.roomNumber ?? null,
      externalRoomName: row.externalRoomName ?? null,
      building: row.room?.building ?? null,
      dayOfWeek: row.dayOfWeek as string,
      startTime: this.formatTime(row.startTime as string),
      endTime: this.formatTime(row.endTime as string),
      loadType: row.loadType ?? null,
    };
  }

  private compareRows(a: Schedule, b: Schedule): number {
    const dayA = DAY_ORDER[a.dayOfWeek ?? ''] ?? 99;
    const dayB = DAY_ORDER[b.dayOfWeek ?? ''] ?? 99;
    if (dayA !== dayB) return dayA - dayB;

    const start = String(a.startTime ?? '').localeCompare(
      String(b.startTime ?? ''),
    );
    if (start !== 0) return start;

    return String(a.subject?.subjectCode ?? '').localeCompare(
      String(b.subject?.subjectCode ?? ''),
    );
  }

  /**
   * Contract 3.3 — "IDP-linked" has exactly one meaning: IDP has delivered
   * this row at least once, so `last_synced_at` is set. A `wmsu_id` alone is
   * not evidence: locally provisioned faculty carry one too. A row whose last
   * sync failed keeps its `last_synced_at`, so it stays linked while the
   * status shows `failed`.
   */
  private isIdpLinked(row: Faculty): boolean {
    return row.lastSyncedAt !== null;
  }

  private termCode(term: Term): string | null {
    return term.semester ? `${term.schoolYear}-${term.semester}` : null;
  }

  private formatTime(value: string): string {
    return value.slice(0, 5);
  }
}

function hasValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * `live`     — enabled with both halves of the outbound credential present.
 * `configured_disabled` — fully configured but the kill switch is off.
 * `incomplete` — turned on, but the base URL or API key is missing, so no
 *                call can be made; mirrors the `degraded` health answer.
 * `not_configured` — neither the switch nor the credentials are set.
 */
function integrationState(
  enabled: boolean,
  baseUrlConfigured: boolean,
  apiKeyConfigured: boolean,
): IntegrationState {
  if (!enabled) {
    return baseUrlConfigured && apiKeyConfigured
      ? 'configured_disabled'
      : 'not_configured';
  }
  return baseUrlConfigured && apiKeyConfigured ? 'live' : 'incomplete';
}
