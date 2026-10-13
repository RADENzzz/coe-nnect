import { api } from './client';

export interface StatsOverview {
  activeDepartments: number;
  activeFaculty: number;
  activeSubjects: number;
  activeRooms: number;
  activeSections: number;
  scheduleEntries: number;
  academicTerms: number;
  activeAccounts: number;
}

export async function fetchStatsOverview(): Promise<StatsOverview> {
  const { data } = await api.get('/v1/stats/overview');
  return data.data;
}
