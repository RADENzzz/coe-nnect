import { api } from './client';

export interface SubjectRecord {
  subjectId: string;
  subjectCode: string;
  title: string;
  totalUnits: number;
  lectureUnits: number;
  labUnits: number;
  deptId: string;
  requiredRoomType: string | null;
}

export async function fetchSubjects(): Promise<SubjectRecord[]> {
  const { data } = await api.get('/v1/subjects');
  return data.data;
}