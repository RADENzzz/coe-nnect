import { api } from './client';

/**
 * Public landing-page API.
 *
 * These endpoints need no session. They return only published schedules,
 * aggregate counts, and a minimal faculty directory.
 */

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

export async function fetchPublicOverview(): Promise<PublicOverview> {
  const { data } = await api.get('/v1/public/overview');
  return data.data;
}

export async function fetchPublicSchedules(
  termId?: string,
): Promise<PublicSchedules> {
  const { data } = await api.get('/v1/public/schedules', {
    params: termId ? { termId } : undefined,
  });
  return data.data;
}

export async function fetchPublicFaculty(options?: {
  departmentCode?: string;
  idpOnly?: boolean;
}): Promise<PublicFaculty> {
  const { data } = await api.get('/v1/public/faculty', {
    params: {
      departmentCode: options?.departmentCode || undefined,
      idpOnly: options?.idpOnly ? 'true' : undefined,
    },
  });
  return data.data;
}

// ────────────────────────────────────────────
// Integration status (IDP team view)
// ────────────────────────────────────────────

export type IntegrationState =
  | 'live'
  | 'configured_disabled'
  | 'incomplete'
  | 'not_configured';

export type IntegrationMilestoneStatus = 'done' | 'in_progress' | 'planned';

export interface IntegrationMilestone {
  key: string;
  title: string;
  status: IntegrationMilestoneStatus;
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
  milestones: IntegrationMilestone[];
}

export async function fetchPublicIntegration(): Promise<PublicIntegrationStatus> {
  const { data } = await api.get('/v1/public/integration');
  return data.data;
}
