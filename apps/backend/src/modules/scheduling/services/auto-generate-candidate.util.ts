import { createHash } from 'node:crypto';

export interface CandidateBlock {
  sectionId: string;
  subjectId: string;
  loadType?: string | null;
  day: string;
  startTime: string;
  endTime?: string;
  roomId?: string | null;
  facultyId?: string | null;
  sectionCode?: string | null;
  sessionIndex?: number | null;
  [key: string]: unknown;
}

export interface UnscheduledBlock {
  sectionId: string;
  subjectId: string;
  kind: string;
  sessionIndex: number;
  sectionCode?: string | null;
  subjectCode?: string | null;
  [key: string]: unknown;
}

export interface AutoGenerateTokenPayload {
  termId: string;
  deptId: string;
  userId: string;
  generatedAt: string;
  fingerprint: string;
}

type NormalizedPlacementTuple = [string, string, string, string, string];

type NormalizedUnscheduledTuple = [string, string, string, number];

function normalizeLoadType(loadType: string | null | undefined): string {
  return String(loadType ?? '');
}

function normalizePlacementTuple(
  block: CandidateBlock,
): NormalizedPlacementTuple {
  return [
    String(block.sectionId),
    String(block.subjectId),
    normalizeLoadType(block.loadType),
    String(block.day),
    String(block.startTime),
  ];
}

function normalizeUnscheduledTuple(
  block: UnscheduledBlock,
): NormalizedUnscheduledTuple {
  return [
    String(block.sectionId),
    String(block.subjectId),
    String(block.kind),
    Number(block.sessionIndex),
  ];
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeCandidatePlacement(schedule: CandidateBlock[]): string {
  const tuples = schedule
    .map(normalizePlacementTuple)
    .sort((a, b) => stableJson(a).localeCompare(stableJson(b)));
  return stableJson(tuples);
}

function normalizeFingerprintBlock(block: CandidateBlock) {
  return {
    sectionId: String(block.sectionId),
    subjectId: String(block.subjectId),
    loadType: normalizeLoadType(block.loadType),
    day: String(block.day),
    startTime: String(block.startTime),
    endTime: String(block.endTime ?? ''),
    roomId: String(block.roomId ?? ''),
    facultyId: String(block.facultyId ?? ''),
    sectionCode: String(block.sectionCode ?? ''),
    sessionIndex:
      block.sessionIndex == null ? null : Number(block.sessionIndex),
  };
}

function normalizeFingerprintUnscheduled(block: UnscheduledBlock) {
  return {
    sectionId: String(block.sectionId),
    subjectId: String(block.subjectId),
    kind: String(block.kind),
    sessionIndex: Number(block.sessionIndex),
    sectionCode: String(block.sectionCode ?? ''),
    subjectCode: String(block.subjectCode ?? ''),
  };
}

export function candidateFingerprint(
  schedule: CandidateBlock[],
  unscheduled: UnscheduledBlock[],
): string {
  const placement = schedule
    .map(normalizeFingerprintBlock)
    .sort((a, b) => stableJson(a).localeCompare(stableJson(b)));
  const waiting = unscheduled
    .map(normalizeFingerprintUnscheduled)
    .sort((a, b) => stableJson(a).localeCompare(stableJson(b)));
  return sha256(stableJson({ placement, unscheduled: waiting }));
}

export function buildAutoGenerateToken(
  input: AutoGenerateTokenPayload,
): string {
  const payload: AutoGenerateTokenPayload = {
    termId: String(input.termId),
    deptId: String(input.deptId),
    userId: String(input.userId),
    generatedAt: String(input.generatedAt),
    fingerprint: String(input.fingerprint),
  };
  return sha256(stableJson(payload));
}

export function verifyAutoGenerateToken(
  token: string,
  input: AutoGenerateTokenPayload,
): boolean {
  return token === buildAutoGenerateToken(input);
}

export function ownAutoDraftRowToCandidateBlock(row: {
  section_id?: string | number | null;
  sectionId?: string | number | null;
  subject_id?: string | number | null;
  subjectId?: string | number | null;
  load_type?: string | null;
  loadType?: string | null;
  day_of_week?: string | null;
  dayOfWeek?: string | null;
  day?: string | null;
  start_time?: string | null;
  startTime?: string | null;
  end_time?: string | null;
  endTime?: string | null;
  room_id?: string | number | null;
  roomId?: string | number | null;
  faculty_id?: string | number | null;
  facultyId?: string | number | null;
  section?: string | null;
  section_code?: string | null;
  sectionCode?: string | null;
  session_index?: number | null;
  sessionIndex?: number | null;
}): CandidateBlock {
  return {
    sectionId: String(row.sectionId ?? row.section_id ?? ''),
    subjectId: String(row.subjectId ?? row.subject_id ?? ''),
    loadType: row.loadType ?? row.load_type ?? null,
    day: String(row.day ?? row.dayOfWeek ?? row.day_of_week ?? ''),
    startTime: String(row.startTime ?? row.start_time ?? ''),
    endTime: row.endTime ?? row.end_time ?? undefined,
    roomId:
      row.roomId ?? row.room_id != null
        ? String(row.roomId ?? row.room_id)
        : null,
    facultyId:
      row.facultyId ?? row.faculty_id != null
        ? String(row.facultyId ?? row.faculty_id)
        : null,
    sectionCode: row.sectionCode ?? row.section_code ?? row.section ?? null,
    sessionIndex: row.sessionIndex ?? row.session_index ?? null,
  };
}
