import { api } from './client';

export interface FacultyQualification {
  qualId: string;
  facultyId: string;
  subjectId: string;
  sourceSystem: string | null;
  subject?: {
    subjectId: string;
    subjectCode: string;
    title: string;
    totalUnits: number;
    lectureUnits: number;
    labUnits: number;
  };
}

export async function fetchFacultyQualifications(
  facultyId: string,
): Promise<FacultyQualification[]> {
  const { data } = await api.get(`/v1/faculty/${facultyId}/qualifications`);
  return data.data;
}

export interface QualifiedFaculty {
  facultyId: string;
  firstName: string;
  lastName: string;
  deptId: string | null;
  deptCode: string | null;
  deptName: string | null;
  classification: string;
  requiredHours: number | null;
  qualId: string;
}

/**
 * College-wide qualified faculty for one subject.
 *
 * Includes faculty from other departments so a DH plotting a minor subject can
 * see every qualified teacher; the cross-department request is created by the
 * plot endpoint when the choice is saved.
 */
export async function fetchQualifiedFaculty(
  subjectId: string,
): Promise<QualifiedFaculty[]> {
  const { data } = await api.get('/v1/faculty/qualified', {
    params: { subjectId },
  });
  return data.data;
}

export interface QualifiedFacultyForSubject extends QualifiedFaculty {
  subjectId: string;
}

/**
 * Batch inverse lookup: every qualified teacher for each subject, returned as
 * (faculty, subject) pairs so the caller can group by teacher.
 */
export async function fetchQualifiedFacultyForSubjects(
  subjectIds: string[],
): Promise<QualifiedFacultyForSubject[]> {
  if (subjectIds.length === 0) return [];
  const { data } = await api.get('/v1/faculty/qualified', {
    params: { subjectIds: subjectIds.join(',') },
  });
  return data.data;
}

export async function addFacultyQualification(
  facultyId: string,
  subjectId: string,
): Promise<FacultyQualification> {
  const { data } = await api.post(`/v1/faculty/${facultyId}/qualifications`, {
    subjectId,
  });
  return data.data;
}

export async function updateFacultyQualification(
  facultyId: string,
  qualId: string,
  input: { subjectId?: string; sourceSystem?: string },
): Promise<FacultyQualification> {
  const { data } = await api.patch(
    `/v1/faculty/${facultyId}/qualifications/${qualId}`,
    input,
  );
  return data.data;
}

export async function removeFacultyQualification(
  facultyId: string,
  qualId: string,
): Promise<void> {
  await api.delete(`/v1/faculty/${facultyId}/qualifications/${qualId}`);
}

/** Batch delete — one request for any number of selected qualifications. */
export async function removeFacultyQualificationsBulk(
  facultyId: string,
  qualIds: string[],
): Promise<{ deleted: number }> {
  const { data } = await api.post(
    `/v1/faculty/${facultyId}/qualifications/bulk-delete`,
    { qualIds },
  );
  return data.data;
}
