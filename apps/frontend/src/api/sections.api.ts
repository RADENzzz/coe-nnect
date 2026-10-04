import { api } from './client';

export interface Section {
  sectionId: string;
  sectionCode: string;
  programId: string | null;
  yearLevel: number | null;
  studentCount: number | null;
  isActive: boolean;
}

export interface CreateSectionInput {
  sectionCode: string;
  programId?: string;
  yearLevel?: number;
  studentCount?: number;
}

export async function fetchSections(): Promise<Section[]> {
  const { data } = await api.get('/v1/sections');
  return data.data;
}

export async function createSection(input: CreateSectionInput): Promise<Section> {
  const { data } = await api.post('/v1/sections', input);
  return data.data;
}

export async function updateSection(
  id: string,
  input: Partial<CreateSectionInput>,
): Promise<Section> {
  const { data } = await api.patch(`/v1/sections/${id}`, input);
  return data.data;
}

export async function toggleSectionActive(id: string): Promise<Section> {
  const { data } = await api.patch(`/v1/sections/${id}/toggle-active`);
  return data.data;
}

export async function deleteSection(id: string): Promise<void> {
  await api.delete(`/v1/sections/${id}`);
}