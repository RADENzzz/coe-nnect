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